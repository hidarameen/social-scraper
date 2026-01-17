"""
FastAPI Micro-service for Userbot Authentication
Runs as a persistent subprocess to maintain Pyrogram client state
"""
import asyncio
import logging
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))
from services.userbot_auth import userbot_auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class LoginRequest(BaseModel):
    phone_number: str

class VerifyCodeRequest(BaseModel):
    phone_number: str
    code: str

class Verify2FARequest(BaseModel):
    phone_number: str
    password: str

class CancelRequest(BaseModel):
    phone_number: str

class LogoutRequest(BaseModel):
    phone_number: Optional[str] = None

@app.post("/start-login")
async def start_login(req: LoginRequest):
    result = await userbot_auth.start_login(req.phone_number)
    return result

@app.post("/verify-code")
async def verify_code(req: VerifyCodeRequest):
    result = await userbot_auth.verify_code(req.phone_number, req.code)
    return result

@app.post("/verify-2fa")
async def verify_2fa(req: Verify2FARequest):
    result = await userbot_auth.verify_2fa(req.phone_number, req.password)
    return result

@app.post("/cancel-login")
async def cancel_login(req: CancelRequest):
    result = await userbot_auth.cancel_login(req.phone_number)
    return result

@app.post("/logout")
async def logout(req: LogoutRequest):
    result = await userbot_auth.logout(req.phone_number)
    return result

@app.get("/login-status/{phone_number}")
async def get_login_status(phone_number: str):
    result = await userbot_auth.get_login_status(phone_number)
    return result

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
