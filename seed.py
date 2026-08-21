from database import SessionLocal, engine
import models
import datetime

def seed_database():
    print("Seeding database with initial data from the hackathon report...")
    
    db = SessionLocal()
    
    # 1. Clear existing data to ensure a fresh demo
    db.query(models.CounterfeitAlert).delete()
    db.query(models.DrugRegistration).delete()
    db.query(models.ScanTelemetry).delete()

    # 2. Add genuine Drug Registration (as per the Ajanta Pharma example)
    genuine_drug = models.DrugRegistration(
        nafdac_number="04-1234", # Mock NAFDAC
        manufacturer="Ajanta Pharma Limited",
        brand_name="Combisunate 20/120",
        expected_format="Pack size of 30 x 24 tablets"
    )
    db.add(genuine_drug)

    # 3. Add Counterfeit Alert for Aflotin 20/120 (from the PDF alert No. 08/2025)
    alert = models.CounterfeitAlert(
        brand_name="Aflotin 20/120",
        batch_number="PA2128L",
        reported_date=datetime.datetime.utcnow(),
        description="Falsified batch PA2128L. Genuine batch PA2128L was for Combisunate 20/120 and expired in Nov 2020. Counterfeit sold as Aflotin 20/120 in 1 x 18 tablets with expiry March 2026."
    )
    db.add(alert)
    
    # 4. Add some dummy telemetry data to simulate scans at open drug markets
    # E.g., Bridge Head Market in Onitsha (approx: 6.133, 6.783)
    # E.g., Idumota in Lagos (approx: 6.460, 3.385)
    
    telemetry_data = [
        models.ScanTelemetry(latitude=6.133, longitude=6.783, drug_name="Aflotin 20/120", batch_number="PA2128L", verdict="COUNTERFEIT"),
        models.ScanTelemetry(latitude=6.135, longitude=6.784, drug_name="Aflotin 20/120", batch_number="PA2128L", verdict="COUNTERFEIT"),
        models.ScanTelemetry(latitude=6.460, longitude=3.385, drug_name="Combisunate 20/120", batch_number="VALID123", verdict="SAFE"),
    ]
    for t in telemetry_data:
        db.add(t)

    db.commit()
    db.close()
    print("Database seeded successfully!")

if __name__ == "__main__":
    models.Base.metadata.create_all(bind=engine)
    seed_database()
