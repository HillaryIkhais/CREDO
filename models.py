from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, DateTime
from database import Base
import datetime

class DrugRegistration(Base):
    __tablename__ = "drug_registrations"

    id = Column(Integer, primary_key=True, index=True)
    nafdac_number = Column(String, unique=True, index=True)
    manufacturer = Column(String)
    brand_name = Column(String, index=True)
    expected_format = Column(String) # A JSON string or description of how the packaging should look

class CounterfeitAlert(Base):
    __tablename__ = "counterfeit_alerts"

    id = Column(Integer, primary_key=True, index=True)
    brand_name = Column(String, index=True)
    batch_number = Column(String, index=True)
    reported_date = Column(DateTime, default=datetime.datetime.utcnow)
    description = Column(String)

class ScanTelemetry(Base):
    __tablename__ = "scan_telemetry"

    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    drug_name = Column(String, index=True)
    batch_number = Column(String, index=True)
    verdict = Column(String) # 'SAFE', 'COUNTERFEIT', 'UNKNOWN'
    scan_timestamp = Column(DateTime, default=datetime.datetime.utcnow)
