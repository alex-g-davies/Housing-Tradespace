"""R3: isochrone overlay. R5: the Mapbox token reaches Mapbox but never the
client response, and never appears in error details."""

TOKEN = "test-token-do-not-leak"


def test_fixture_mode_needs_no_token(make_client):
    """With no token, the committed fixture is served (fixture-first)."""
    client = make_client(mapbox_token="")
    r = client.get("/api/isochrone")
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection"
    assert fc["properties"]["contour_minutes"] == 30
    assert fc["properties"]["work"] == {"lat": 47.6062, "lon": -122.3321}
    feat = fc["features"][0]
    assert feat["geometry"]["type"] == "Polygon"
    assert feat["properties"]["contour_minutes"] == 30
    # Mapbox styling props stripped even from the fixture.
    assert "fill" not in feat["properties"]
    assert "fillOpacity" not in feat["properties"]


def test_live_mode_calls_mapbox_and_strips_props(make_client, httpx_mock, mapbox_response):
    httpx_mock.add_response(json=mapbox_response)
    client = make_client(mapbox_token=TOKEN)

    r = client.get("/api/isochrone")
    assert r.status_code == 200
    fc = r.json()
    feat = fc["features"][0]
    assert feat["geometry"]["type"] == "Polygon"
    assert feat["properties"]["contour_minutes"] == 30
    for styling in ("fill", "fillOpacity", "fillColor", "color", "opacity", "metric"):
        assert styling not in feat["properties"]


def test_token_sent_to_mapbox_but_not_to_client(make_client, httpx_mock, mapbox_response):
    httpx_mock.add_response(json=mapbox_response)
    client = make_client(mapbox_token=TOKEN)

    r = client.get("/api/isochrone")
    # R5a: the token IS sent to Mapbox (server-side call).
    outbound = httpx_mock.get_requests()
    assert len(outbound) == 1
    assert TOKEN in str(outbound[0].url)
    assert "api.mapbox.com" in str(outbound[0].url)
    # R5b: the token is NOWHERE in the response sent to the client.
    assert TOKEN not in r.text
    assert all(TOKEN not in v for v in r.headers.values())


def test_response_is_cached_mapbox_hit_once(make_client, httpx_mock, mapbox_response):
    httpx_mock.add_response(json=mapbox_response)
    client = make_client(mapbox_token=TOKEN)

    first = client.get("/api/isochrone")
    second = client.get("/api/isochrone")
    assert first.json() == second.json()
    # Cached: Mapbox called only once despite two client requests.
    assert len(httpx_mock.get_requests()) == 1


def test_upstream_failure_returns_503_without_token(make_client, httpx_mock):
    httpx_mock.add_response(status_code=500)
    client = make_client(mapbox_token=TOKEN)

    r = client.get("/api/isochrone")
    assert r.status_code == 503
    assert TOKEN not in r.text
    assert r.json()["detail"] == "isochrone upstream unavailable"
