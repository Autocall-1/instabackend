"""
services/payment_service.py — Cashfree payment gateway integration
"""

import httpx
import uuid
from datetime import datetime
from core.config import settings
from firebase.firebase_service import PaymentService, PlanService, FirebaseService
from core.security import verify_cashfree_signature
import logging

logger = logging.getLogger(__name__)

CASHFREE_HEADERS = {
    "Content-Type":   "application/json",
    "x-api-version":  "2023-08-01",
    "x-client-id":    settings.CASHFREE_APP_ID,
    "x-client-secret": settings.CASHFREE_SECRET_KEY,
}


class CashfreeService:

    # ── Create Order ──────────────────────────────────────
    @staticmethod
    async def create_order(uid: str, plan_id: str) -> dict:
        """
        Creates a Cashfree payment order.
        Returns payment_session_id for frontend checkout.
        """
        amount_paise = settings.PLAN_PRICES.get(plan_id)
        if not amount_paise:
            raise ValueError(f"Invalid plan: {plan_id}")

        amount_rupees = amount_paise / 100
        order_id      = f"FV_{uid[:8]}_{uuid.uuid4().hex[:8].upper()}"

        # Get user info for Cashfree
        user = FirebaseService.get_user(uid)
        if not user:
            raise ValueError("User not found")

        payload = {
            "order_id":       order_id,
            "order_amount":   amount_rupees,
            "order_currency": "INR",
            "customer_details": {
                "customer_id":    uid,
                "customer_email": user.get("email", ""),
                "customer_name":  user.get("name", "User"),
                "customer_phone": user.get("phone", "9999999999"),
            },
            "order_meta": {
                "return_url":  f"https://yourdomain.com/dashboard/subscription.html?order_id={order_id}&plan_id={plan_id}",
                "notify_url":  f"https://your-backend.com/api/v1/payment/webhook",
            },
            "order_note": f"FinVest Pro {plan_id} subscription",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.CASHFREE_BASE_URL}/orders",
                json=payload,
                headers=CASHFREE_HEADERS,
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()

        # Save pending payment record
        PaymentService.create_payment_record(
            uid=uid,
            order_id=order_id,
            plan_id=plan_id,
            amount=amount_paise
        )

        logger.info(f"Order created: {order_id} uid={uid} plan={plan_id}")
        return {
            "order_id":          order_id,
            "payment_session_id": data.get("payment_session_id"),
            "amount":            amount_rupees,
            "plan_id":           plan_id,
        }

    # ── Verify Payment ────────────────────────────────────
    @staticmethod
    async def verify_payment(uid: str, order_id: str, plan_id: str) -> dict:
        """
        Verifies payment with Cashfree API and activates plan if SUCCESS.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.CASHFREE_BASE_URL}/orders/{order_id}",
                headers=CASHFREE_HEADERS,
                timeout=30
            )
            resp.raise_for_status()
            order_data = resp.json()

        cf_status = order_data.get("order_status")
        logger.info(f"Payment status for {order_id}: {cf_status}")

        if cf_status == "PAID":
            # Activate plan
            duration     = settings.PLAN_DURATIONS.get(plan_id, 30)
            expiry_date  = PlanService.activate_plan(
                uid=uid,
                plan_id=plan_id,
                duration_days=duration,
                order_id=order_id,
                amount=settings.PLAN_PRICES.get(plan_id, 0)
            )

            user = FirebaseService.get_user(uid)
            PaymentService.update_payment_status(
                order_id=order_id,
                status="SUCCESS",
                payment_id=order_data.get("cf_order_id", ""),
                user_email=user.get("email", "") if user else ""
            )

            return {
                "success":     True,
                "message":     "Payment successful! Plan activated.",
                "plan_id":     plan_id.replace("_yearly", ""),
                "expiry_date": expiry_date,
            }

        elif cf_status in ("ACTIVE", "PENDING"):
            PaymentService.update_payment_status(order_id, "PENDING")
            return {"success": False, "message": "Payment is pending. Please wait."}
        else:
            PaymentService.update_payment_status(order_id, "FAILED")
            return {"success": False, "message": f"Payment failed: {cf_status}"}

    # ── Webhook Handler ───────────────────────────────────
    @staticmethod
    async def handle_webhook(payload: dict) -> dict:
        """
        Handles Cashfree payment webhook (server-to-server callback).
        Verify signature before processing.
        """
        data = payload.get("data", {})
        order_data   = data.get("order",   {})
        payment_data = data.get("payment", {})

        order_id  = order_data.get("order_id", "")
        cf_status = payment_data.get("payment_status", "")

        if not order_id:
            return {"status": "ignored"}

        # Retrieve order from DB
        payment = PaymentService.get_payment(order_id)
        if not payment:
            logger.warning(f"Webhook for unknown order: {order_id}")
            return {"status": "unknown_order"}

        if cf_status == "SUCCESS":
            uid     = payment.get("uid")
            plan_id = payment.get("plan")
            if uid and plan_id and payment.get("status") != "SUCCESS":
                duration = settings.PLAN_DURATIONS.get(plan_id, 30)
                PlanService.activate_plan(
                    uid=uid, plan_id=plan_id,
                    duration_days=duration,
                    order_id=order_id,
                    amount=payment.get("amount", 0)
                )
                PaymentService.update_payment_status(
                    order_id, "SUCCESS",
                    payment_id=payment_data.get("cf_payment_id", "")
                )
                logger.info(f"Webhook activated plan: uid={uid} plan={plan_id}")

        elif cf_status == "FAILED":
            PaymentService.update_payment_status(order_id, "FAILED")

        return {"status": "processed"}
