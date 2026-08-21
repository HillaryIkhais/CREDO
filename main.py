from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import SessionLocal, engine, get_db

# Create all database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Scan Before You Swallow API",
    description="Backend for the offline verification AI app for counterfeit drug detection",
    version="1.0.0"
)

# Setup CORS for possible dashboard integration later
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Scan Before You Swallow API"}

@app.get("/api/v1/sync", response_model=schemas.SyncPayload)
def sync_data(db: Session = Depends(get_db)):
    """
    Returns the latest NAFDAC counterfeit alerts and valid drug formats.
    The mobile app should call this when online to update its local SQLite database.
    """
    drug_registrations = db.query(models.DrugRegistration).all()
    counterfeit_alerts = db.query(models.CounterfeitAlert).all()
    
    return schemas.SyncPayload(
        drug_registrations=drug_registrations,
        counterfeit_alerts=counterfeit_alerts
    )

@app.post("/api/v1/telemetry", response_model=schemas.ScanTelemetrySchema)
def ingest_telemetry(telemetry: schemas.ScanTelemetryCreate, db: Session = Depends(get_db)):
    """
    Ingest scan data from the mobile app (geospatial data + authenticity verdict).
    """
    db_telemetry = models.ScanTelemetry(**telemetry.model_dump())
    db.add(db_telemetry)
    db.commit()
    db.refresh(db_telemetry)
    return db_telemetry

@app.get("/api/v1/telemetry/heatmap", response_model=List[schemas.ScanTelemetrySchema])
def get_heatmap_data(db: Session = Depends(get_db)):
    """
    Returns all telemetry data for heatmap visualization on the intelligence dashboard.
    """
    return db.query(models.ScanTelemetry).all()
