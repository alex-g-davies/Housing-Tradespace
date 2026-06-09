"""Address search (forward geocoding). The token reaches Mapbox but never the
client; misses are 404 and upstream/no-token failures degrade cleanly."""

TOKEN = "test-token-do-not-leak"
SAMPLE = {
    "features": [
        {"center": [-122.2966, 47.518], "place_name": "Museum of Flight, Seattle, Washington"}
    ]
}


def test_geocode_returns_latlon(make_client, httpx_mock):
    httpx_mock.add_response(json=SAMPLE)
    client = make_client(mapbox_token=TOKEN)

    r = client.get("/api/geocode", params={"q": "Museum of Flight"})
    assert r.status_code == 200
    body = r.json()
    assert body["lat"] == 47.518 and body["lon"] == -122.2966  # [lon,lat] -> lat,lon
    assert "Museum" in body["place_name"]

    url = str(httpx_mock.get_requests()[0].url)
    assert TOKEN in url  # token sent to Mapbox
    assert TOKEN not in r.text  # never to the client (R5)


def test_geocode_no_match_returns_404(make_client, httpx_mock):
    httpx_mock.add_response(json={"features": []})
    client = make_client(mapbox_token=TOKEN)
    assert client.get("/api/geocode", params={"q": "zzzzz nowhere"}).status_code == 404


def test_geocode_requires_token(make_client):
    client = make_client(mapbox_token="")
    r = client.get("/api/geocode", params={"q": "Seattle"})
    assert r.status_code == 503
    assert "token" in r.json()["detail"]


def test_geocode_upstream_error_503_without_token(make_client, httpx_mock):
    httpx_mock.add_response(status_code=500)
    client = make_client(mapbox_token=TOKEN)
    r = client.get("/api/geocode", params={"q": "Seattle"})
    assert r.status_code == 503
    assert TOKEN not in r.text


def test_geocode_requires_nonempty_query(make_client):
    client = make_client(mapbox_token=TOKEN)
    assert client.get("/api/geocode", params={"q": ""}).status_code == 422
