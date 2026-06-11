"""Spec 011 R2/R5/R6: routed commute estimates — parsing, snapping/caching,
budget, geofence/distance guards, token safety, degradation."""

TOKEN = "test-token-do-not-leak"

# Conftest fixture coverage: WA bbox [-122.36, 47.6, -122.28, 47.7].
HOME = {"from_lat": 47.61, "from_lon": -122.33}
WORK = {"to_lat": 47.65, "to_lon": -122.30}
PARAMS = {**HOME, **WORK}

OK_ROUTE = {"code": "Ok", "routes": [{"duration": 3120}]}  # 52 min


def test_commute_returns_both_legs(make_client, httpx_mock):
    httpx_mock.add_response(json=OK_ROUTE, is_reusable=True)
    client = make_client(mapbox_token=TOKEN)
    r = client.get("/api/commute", params=PARAMS)
    assert r.status_code == 200
    body = r.json()
    assert body["am_minutes"] == 52 and body["pm_minutes"] == 52
    assert "T08:00" in body["am_depart_local"]
    assert "T17:30" in body["pm_depart_local"]

    reqs = httpx_mock.get_requests()
    assert len(reqs) == 2
    am_url = str(reqs[0].url)
    assert "driving-traffic" in am_url and "depart_at=" in am_url
    assert TOKEN in am_url and TOKEN not in r.text


def test_commute_pm_leg_reverses_coordinates(make_client, httpx_mock):
    httpx_mock.add_response(json=OK_ROUTE, is_reusable=True)
    client = make_client(mapbox_token=TOKEN)
    assert client.get("/api/commute", params=PARAMS).status_code == 200
    am_path = httpx_mock.get_requests()[0].url.path
    pm_path = httpx_mock.get_requests()[1].url.path
    # Snapped: home (-122.33, 47.61), work (-122.3, 47.65)
    assert am_path.endswith("-122.33,47.61;-122.3,47.65")
    assert pm_path.endswith("-122.3,47.65;-122.33,47.61")


def test_commute_cached_by_snapped_endpoints(make_client, httpx_mock):
    httpx_mock.add_response(json=OK_ROUTE, is_reusable=True)
    client = make_client(mapbox_token=TOKEN)
    assert client.get("/api/commute", params=PARAMS).status_code == 200
    # Identical request -> cache.
    assert client.get("/api/commute", params=PARAMS).status_code == 200
    # ~100 m away -> same 500 m cell -> still cached.
    nudged = {**PARAMS, "from_lat": 47.6109, "from_lon": -122.3304}
    assert client.get("/api/commute", params=nudged).status_code == 200
    assert len(httpx_mock.get_requests()) == 2  # one AM + one PM total


def test_commute_budget_reserves_two_calls(make_client, httpx_mock):
    httpx_mock.add_response(json=OK_ROUTE, is_reusable=True)
    client = make_client(mapbox_token=TOKEN, mapbox_daily_call_budget=3)
    assert client.get("/api/commute", params=PARAMS).status_code == 200  # spends 2
    far = {**PARAMS, "from_lat": 47.69, "from_lon": -122.29}  # different cell
    r = client.get("/api/commute", params=far)  # needs 2, only 1 left
    assert r.status_code == 503
    assert len(httpx_mock.get_requests()) == 2


def test_commute_geofence_and_distance_guards(make_client, httpx_mock):
    client = make_client(mapbox_token=TOKEN)
    out = client.get(
        "/api/commute",
        params={"from_lat": 0, "from_lon": 0, **WORK},
    )
    assert out.status_code == 422
    assert "covered regions" in out.json()["detail"]
    # Both points covered (WA + OH fixtures) but ~2,000 mi apart.
    cross = client.get(
        "/api/commute",
        params={**HOME, "to_lat": 40.05, "to_lon": -82.65},
    )
    assert cross.status_code == 422
    assert "too far apart" in cross.json()["detail"]
    assert len(httpx_mock.get_requests()) == 0  # guards spend nothing


def test_commute_requires_token(make_client):
    client = make_client(mapbox_token="")
    r = client.get("/api/commute", params=PARAMS)
    assert r.status_code == 503
    assert "token" in r.json()["detail"]


def test_commute_upstream_error_503_without_token_leak(make_client, httpx_mock):
    httpx_mock.add_response(status_code=500, is_reusable=True)
    client = make_client(mapbox_token=TOKEN)
    r = client.get("/api/commute", params=PARAMS)
    assert r.status_code == 503
    assert TOKEN not in r.text


def test_commute_no_route_404_and_cached(make_client, httpx_mock):
    httpx_mock.add_response(json={"code": "NoRoute", "routes": []}, is_reusable=True)
    client = make_client(mapbox_token=TOKEN)
    assert client.get("/api/commute", params=PARAMS).status_code == 404
    assert client.get("/api/commute", params=PARAMS).status_code == 404  # cached miss
    assert len(httpx_mock.get_requests()) == 2  # only the first attempt's legs


def test_commute_rejects_out_of_range_params(make_client):
    client = make_client(mapbox_token=TOKEN)
    assert client.get("/api/commute", params={**PARAMS, "from_lat": 91}).status_code == 422
