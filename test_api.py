from fastapi.testclient import TestClient
from main import app
import json

client = TestClient(app)

def run_tests():
    print("Testing /api/v1/sync endpoint...")
    response = client.get("/api/v1/sync")
    assert response.status_code == 200
    data = response.json()
    assert "drug_registrations" in data
    assert "counterfeit_alerts" in data
    print("Sync Payload:", json.dumps(data, indent=2))
    
    print("\nTesting /api/v1/telemetry endpoint...")
    telemetry_payload = {
        "latitude": 6.130,
        "longitude": 6.780,
        "drug_name": "Aflotin 20/120",
        "batch_number": "UNKNOWN123",
        "verdict": "UNKNOWN"
    }
    response = client.post("/api/v1/telemetry", json=telemetry_payload)
    assert response.status_code == 200
    post_data = response.json()
    print("Telemetry Response:", json.dumps(post_data, indent=2))
    
    print("\nTesting /api/v1/telemetry/heatmap endpoint...")
    response = client.get("/api/v1/telemetry/heatmap")
    assert response.status_code == 200
    heatmap_data = response.json()
    print(f"Heatmap contains {len(heatmap_data)} records.")
    print("Tests passed successfully!")

if __name__ == "__main__":
    run_tests()
