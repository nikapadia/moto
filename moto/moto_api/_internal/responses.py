import json
import os
from typing import Any

from botocore.awsrequest import AWSPreparedRequest

from moto import settings
from moto.core import DEFAULT_ACCOUNT_ID
from moto.core.common_types import TYPE_RESPONSE
from moto.core.responses import ActionAuthenticatorMixin, BaseResponse

# Compiled from the React app in /dashboard (`make dashboard`)
DASHBOARD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "moto_server",
    "dashboard",
)
DASHBOARD_ASSET_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


class MotoAPIResponse(BaseResponse):
    def reset_response(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        if request.method == "POST":
            from .models import moto_api_backend

            moto_api_backend.reset()
            return 200, {}, json.dumps({"status": "ok"})
        return 400, {}, json.dumps({"Error": "Need to POST to reset Moto"})

    def reset_auth_response(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        if request.method == "POST":
            previous_initial_no_auth_action_count = (
                settings.INITIAL_NO_AUTH_ACTION_COUNT
            )
            settings.INITIAL_NO_AUTH_ACTION_COUNT = float(request.data.decode())
            ActionAuthenticatorMixin.request_count = 0
            return (
                200,
                {},
                json.dumps(
                    {
                        "status": "ok",
                        "PREVIOUS_INITIAL_NO_AUTH_ACTION_COUNT": str(
                            previous_initial_no_auth_action_count
                        ),
                    }
                ),
            )
        return 400, {}, json.dumps({"Error": "Need to POST to reset Moto Auth"})

    def model_data(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from moto.core.model_instances import model_data

        results: dict[str, dict[str, list[Any]]] = {}
        for service in sorted(model_data):
            models = model_data[service]
            results[service] = {}
            for name in sorted(models):
                model = models[name]
                results[service][name] = []
                for instance in model.instances_tracked:  # type: ignore[attr-defined]
                    inst_result = {}
                    for attr in dir(instance):
                        if not attr.startswith("_"):
                            # Any property can raise anything (a LambdaFunction's
                            # docker_client needs a reachable Docker daemon), and
                            # one bad attribute must not take down the whole response.
                            try:
                                value = getattr(instance, attr)
                                json.dumps(value)
                            except Exception:
                                pass
                            else:
                                inst_result[attr] = value
                    results[service][name].append(inst_result)
        return 200, {"Content-Type": "application/javascript"}, json.dumps(results)

    def dashboard(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        with open(os.path.join(DASHBOARD_DIR, "index.html"), "rb") as file:
            content = file.read()
        return (
            200,
            {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache"},
            content,
        )

    def dashboard_asset(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        name = full_url.split("?")[0].rsplit("/", 1)[-1]
        assets_dir = os.path.join(DASHBOARD_DIR, "assets")
        content_type = DASHBOARD_ASSET_TYPES.get(os.path.splitext(name)[1])
        # Matching against the directory listing also rules out path traversal
        if content_type is None or name not in os.listdir(assets_dir):
            return 404, {}, json.dumps({"Error": f"Unknown asset: {name}"})
        with open(os.path.join(assets_dir, name), "rb") as file:
            content = file.read()
        # Asset file names contain a hash of their content
        cache_control = "public, max-age=31536000, immutable"
        return (
            200,
            {"Content-Type": content_type, "Cache-Control": cache_control},
            content,
        )

    def get_transition(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        qs_dict = dict(
            x.split("=") for x in request.query_string.decode("utf-8").split("&")
        )
        model_name = qs_dict["model_name"]

        resp = moto_api_backend.get_transition(model_name=model_name)

        return 200, {}, json.dumps(resp)

    def set_transition(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        model_name = body["model_name"]
        transition = body["transition"]

        moto_api_backend.set_transition(model_name, transition)
        return 201, {}, ""

    def unset_transition(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        model_name = body["model_name"]

        moto_api_backend.unset_transition(model_name)
        return 201, {}, ""

    def seed(self, req: Any, full_url: str, headers: Any) -> TYPE_RESPONSE:
        self.setup_class(req)
        from . import mock_random

        a = self._get_param("a")
        mock_random.seed(int(a))
        return 200, {}, ""

    def set_athena_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")

        for result in body.get("results", []):
            rows = result["rows"]
            column_info = result.get("column_info", [])
            moto_api_backend.set_athena_result(
                rows=rows,
                column_info=column_info,
                account_id=account_id,
                region=region,
            )
        return 201, {}, ""

    def set_ce_cost_usage_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)

        for result in body.get("results", []):
            moto_api_backend.set_ce_cost_usage(result=result, account_id=account_id)
        return 201, {}, ""

    def set_lambda_simple_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")

        for result in body.get("results", []):
            moto_api_backend.set_lambda_simple_result(
                result=result, account_id=account_id, region=region
            )
        return 201, {}, ""

    def set_resilience_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")

        for result in body.get("results", []):
            moto_api_backend.set_resilience_result(
                result=result, account_id=account_id, region=region
            )
        return 201, {}, ""

    def set_sagemaker_async_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")

        for result in body.get("results", []):
            data = result["data"]
            is_failure = result.get("is_failure", False)
            moto_api_backend.set_sagemaker_async_result(
                data=data,
                is_failure=is_failure,
                account_id=account_id,
                region=region,
            )
        return 201, {}, ""

    def set_sagemaker_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")

        for result in body.get("results", []):
            body = result["Body"]
            content_type = result.get("ContentType")
            prod_variant = result.get("InvokedProductionVariant")
            custom_attrs = result.get("CustomAttributes")
            moto_api_backend.set_sagemaker_result(
                body=body,
                content_type=content_type,
                prod_variant=prod_variant,
                custom_attrs=custom_attrs,
                account_id=account_id,
                region=region,
            )
        return 201, {}, ""

    def set_rds_data_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")

        for result in body.get("results", []):
            records = result.get("records")
            column_metadata = result.get("columnMetadata")
            nr_of_records_updated = result.get("numberOfRecordsUpdated")
            generated_fields = result.get("generatedFields")
            formatted_records = result.get("formattedRecords")
            moto_api_backend.set_rds_data_result(
                records=records,
                column_metadata=column_metadata,
                nr_of_records_updated=nr_of_records_updated,
                generated_fields=generated_fields,
                formatted_records=formatted_records,
                account_id=account_id,
                region=region,
            )
        return 201, {}, ""

    def set_ecr_scan_finding_results(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")

        for result in body.get("results", []):
            moto_api_backend.set_ecr_scan_finding_result(
                results=result,
                account_id=account_id,
                region=region,
            )
        return 201, {}, ""

    def set_inspector2_findings_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")

        for result in body.get("results", []):
            moto_api_backend.set_inspector2_findings_result(
                results=result,
                account_id=account_id,
                region=region,
            )
        return 201, {}, ""

    def set_timestream_result(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        body = self._get_body(headers, request)
        account_id = body.get("account_id", DEFAULT_ACCOUNT_ID)
        region = body.get("region", "us-east-1")
        results = body.get("results", {})

        for query in results:
            moto_api_backend.set_timestream_result(
                query=None if query == "null" else query,
                query_results=results[query],
                account_id=account_id,
                region=region,
            )
        return 201, {}, ""

    def set_proxy_passthrough(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        res_headers = {"Content-Type": "application/json"}

        if request.method == "POST":
            body = self._get_body(headers, request)
            http_urls = body.get("http_urls", [])
            https_hosts = body.get("https_hosts", [])
            moto_api_backend.set_proxy_passthrough(http_urls, https_hosts)
        if request.method == "DELETE":
            moto_api_backend.delete_proxy_passthroughs()

        urls, hosts = moto_api_backend.get_proxy_passthrough()
        resp = {"http_urls": list(urls), "https_hosts": list(hosts)}
        return 201, res_headers, json.dumps(resp).encode("utf-8")

    def config(
        self,
        request: Any,
        full_url: str,
        headers: Any,
    ) -> TYPE_RESPONSE:
        from .models import moto_api_backend

        res_headers = {"Content-Type": "application/json"}

        if request.method == "POST":
            config = self._get_body(headers, request)
            moto_api_backend.set_config(config)

        config = moto_api_backend.get_config()
        return 201, res_headers, json.dumps(config).encode("utf-8")

    def _get_body(self, headers: Any, request: Any) -> Any:
        if isinstance(request, AWSPreparedRequest):
            return json.loads(request.body)  # type: ignore[arg-type]
        else:
            # Werkzeug request
            request_body_size = int(headers["Content-Length"])
            body = request.environ["wsgi.input"].read(request_body_size).decode("utf-8")
            return json.loads(body)
