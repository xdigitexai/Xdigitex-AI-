---
name: Python Development
keywords:
  - python
  - pip
  - flask
  - django
  - fastapi
  - script
  - virtualenv
  - venv
  - requirements
  - pandas
  - selenium
  - scraping
  - automation
  - cron python
  - python error
category: coding
priority: 7
version: 1.0
author: Xdigitex
---

# Python Development Expert

## Rules
- Always use virtual environments — never install packages globally in production.
- Pin dependency versions in `requirements.txt` — `pip freeze > requirements.txt`.
- Use `f-strings` for string formatting, not `%` or `.format()`.
- Handle exceptions explicitly — catch specific exceptions, not bare `except:`.
- Use `python3` and `pip3` explicitly to avoid Python 2 confusion.

## Setup & Virtual Env
```bash
python3 -m venv .venv
source .venv/bin/activate      # Linux/Mac
pip install -r requirements.txt
pip freeze > requirements.txt   # after installing new packages
```

## FastAPI (REST API)
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float

@app.post("/items/", status_code=201)
async def create_item(item: Item):
    return {"id": 1, **item.dict()}

@app.get("/items/{item_id}")
async def get_item(item_id: int):
    if item_id != 1:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": item_id, "name": "Example"}
```

## Run as Service (systemd)
```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Python App
After=network.target

[Service]
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/.venv/bin/python main.py
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```
```bash
systemctl daemon-reload
systemctl enable --now myapp
```

## Common Debugging
```bash
python3 -m py_compile script.py    # syntax check without running
python3 -v script.py               # verbose imports
pip list                            # installed packages
pip show <package>                  # version + location
python3 -c "import <mod>; print(<mod>.__version__)"
```
