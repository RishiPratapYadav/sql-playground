#!/usr/bin/env python3
"""Small test client to exercise the FastAPI server upload endpoint.

Usage: python scripts/test_py_server.py [http://localhost:8000]
"""
import sys
import requests

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000'

files = {'files': open('example-file.txt','rb')}
data = {
    'projectName': 'Test Python Submit',
    'description': 'Submitted by test script',
    'procurementType': 'Services'
}

resp = requests.post(f'{URL}/api/requests', data=data, files=files)
print('status', resp.status_code)
print(resp.json())
