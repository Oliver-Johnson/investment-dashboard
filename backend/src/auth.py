import os
from fastapi import Header, HTTPException

_APP_TOKEN = os.getenv("APP_TOKEN")


async def require_token(x_app_token: str | None = Header(default=None)):
    if not _APP_TOKEN:
        return
    if x_app_token != _APP_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or missing X-App-Token")
