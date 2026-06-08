"""R1/R2/R4: housing values endpoint and the merged choropleth GeoJSON."""


def test_housing_endpoint_shape(client):
    r = client.get("/api/housing")
    assert r.status_code == 200
    body = r.json()
    assert body["metro"] == "Seattle, WA"
    assert body["currency"] == "USD"
    assert body["as_of"] == "2024-12-31"

    zips = body["zips"]
    assert len(zips) == 4  # bad/null/negative rows skipped
    for z in zips:
        assert len(z["zip"]) == 5 and z["zip"].isdigit()
        assert isinstance(z["median_value"], int) and z["median_value"] > 0


def test_zips_geojson_is_valid_feature_collection(client):
    r = client.get("/api/zips.geojson")
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection"

    by_zip = {f["properties"]["zip"]: f["properties"] for f in fc["features"]}
    assert "ZZZ" not in by_zip
    assert by_zip["98101"]["median_value"] == 720000
    assert "median_value" not in by_zip["98115"]  # no-data ZIP
    for f in fc["features"]:
        assert f["geometry"]["type"] == "Polygon"
