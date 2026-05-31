"""A tiny serverless handler with a vendored dependency.

At deploy time, dependencies are vendored next to this file (see build.sh),
producing a deployment package that also carries bytecode caches, test
suites, and *.dist-info metadata. `scc --runtime python` slims that package
by removing exactly that deadweight.
"""

import json

from mylib import greet


def handler(event, context):
    body = event if isinstance(event, dict) else {}
    return {
        "statusCode": 200,
        "body": json.dumps({"msg": greet(body.get("name", "world"))}),
    }
