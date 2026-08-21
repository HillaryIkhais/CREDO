from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class DrugRegistrationBase(BaseModel):
    nafdac_number: str
    manufacturer: str
    brand_name: str
    expected_format: str

class DrugRegistrationSchema(DrugRegistrationBase):
    id: int
    
    class Config:
        from_attributes = True

class CounterfeitAlertBase(BaseModel):
    brand_name: str
    batch_number: str
    description: str

class CounterfeitAlertSchema(CounterfeitAlertBase):
    id: int
    reported_date: datetime
    
    class Config:
        from_attributes = True

class SyncPayload(BaseModel):
    drug_registrations: List[DrugRegistrationSchema]
    counterfeit_alerts: List[CounterfeitAlertSchema]

class ScanTelemetryCreate(BaseModel):
    latitude: float
    longitude: float
    drug_name: str
    batch_number: str
    verdict: str

class ScanTelemetrySchema(ScanTelemetryCreate):
    id: int
    scan_timestamp: datetime
    
    class Config:
        from_attributes = True
