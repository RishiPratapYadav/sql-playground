import os
import requests
import json

SERVER = os.getenv('VSP_SERVER', 'http://localhost:8000')

sample_request = {
    "projectName": "Vaccine packaging rollout",
    "description": "Packaging and serialization needs for multi-site commercial launch",
    "company_name": "Example Pharma",
    "primary_contact": "Dr. Alice",
    "email": "alice@example.com",
    "request_type": "Commercial",
    "services_needed": "Packaging",
    "target_markets": ["United States (FDA)", "European Union (EMA)"],
    "budget": 1500000,
    "decisionDeadline": "2026-03-01",
    "additional_info": "Prefer partners with cold-chain experience",
    "keyCriteria": ["Quality", "Delivery"]
}

if __name__ == '__main__':
    url = f"{SERVER}/api/select_vendors"
    print('POST', url)
    r = requests.post(url, json=sample_request, timeout=30)
    try:
        r.raise_for_status()
    except Exception as e:
        print('Request failed:', e)
        print('Response:', r.status_code, r.text)
        raise
    j = r.json()
    print('\nVendor recommendations:')
    for i, v in enumerate(j.get('vendors', []), 1):
        if isinstance(v, dict):
            print(f"{i}. {v.get('name')} (score: {v.get('score')})\n   {v.get('reason')}")
        else:
            print(f"{i}. {v}")
    if j.get('audit'):
        print('\nAudit: ', j.get('audit'))
