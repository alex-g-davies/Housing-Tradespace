"""R1/R2/002: housing values endpoint (now enriched) and the choropleth GeoJSON."""


def test_housing_endpoint_shape(client):
    r = client.get("/api/housing")
    assert r.status_code == 200
    body = r.json()
    assert body["metro"] == "Seattle, WA"
    assert body["currency"] == "USD"

    zips = {z["zip"]: z for z in body["zips"]}
    assert len(zips) == 4  # bad/null/negative rows skipped
    for z in zips.values():
        assert len(z["zip"]) == 5 and z["zip"].isdigit()
        assert isinstance(z["median_value"], int) and z["median_value"] > 0

    # Enriched metrics are present (and carried as history for the sparkline).
    assert zips["98101"]["yoy_pct"] == 4.2
    assert zips["98101"]["cagr5_pct"] == 8.1
    assert zips["98101"]["ppsf"] == 612
    assert zips["98101"]["history"][0] == ["2023-Q4", 700000]
    # Missing metrics serialize as null, not dropped from the model.
    assert zips["98112"]["yoy_pct"] is None
    assert zips["98109"]["history"] is None


def test_zips_geojson_carries_scalar_metrics(client):
    r = client.get("/api/zips.geojson")
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection"

    by_zip = {f["properties"]["zip"]: f["properties"] for f in fc["features"]}
    assert "ZZZ" not in by_zip
    assert by_zip["98101"]["median_value"] == 720000
    assert by_zip["98101"]["yoy_pct"] == 4.2
    assert by_zip["98101"]["ppsf"] == 612
    assert "history" not in by_zip["98101"]  # not in GeoJSON
    assert "yoy_pct" not in by_zip["98109"]  # omitted -> 'no data' for that metric
    assert "median_value" not in by_zip["98115"]  # no-data ZIP
    for f in fc["features"]:
        assert f["geometry"]["type"] == "Polygon"
