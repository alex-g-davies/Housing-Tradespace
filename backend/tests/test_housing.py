"""R1/R2/002 + region selection: the region index, per-state enriched values, and
the choropleth GeoJSON."""


def test_regions_index(client):
    r = client.get("/api/regions")
    assert r.status_code == 200
    by_code = {x["code"]: x for x in r.json()}
    assert set(by_code) == {"WA", "OH"}
    assert by_code["WA"]["name"] == "Washington"
    assert by_code["WA"]["zip_count"] == 5
    assert len(by_code["OH"]["bbox"]) == 4 and len(by_code["OH"]["center"]) == 2


def test_housing_defaults_to_wa(client):
    r = client.get("/api/housing")
    assert r.status_code == 200
    body = r.json()
    assert body["metro"] == "Washington"

    zips = {z["zip"]: z for z in body["zips"]}
    assert len(zips) == 4  # bad/null/negative rows skipped
    for z in zips.values():
        assert len(z["zip"]) == 5 and z["zip"].isdigit()
        assert isinstance(z["median_value"], int) and z["median_value"] > 0
    assert zips["98101"]["yoy_pct"] == 4.2
    assert zips["98101"]["ppsf"] == 612
    assert zips["98101"]["history"][0] == ["2023-Q4", 700000]
    assert zips["98112"]["yoy_pct"] is None


def test_housing_for_another_state(client):
    r = client.get("/api/housing", params={"state": "OH"})
    assert r.status_code == 200
    body = r.json()
    assert body["metro"] == "Ohio"
    assert [z["zip"] for z in body["zips"]] == ["43001"]


def test_unknown_state_404(client):
    assert client.get("/api/housing", params={"state": "ZZ"}).status_code == 404
    assert client.get("/api/zips.geojson", params={"state": "ZZ"}).status_code == 404


def test_zips_geojson_carries_scalar_metrics(client):
    r = client.get("/api/zips.geojson")  # default WA
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection"

    by_zip = {f["properties"]["zip"]: f["properties"] for f in fc["features"]}
    assert "ZZZ" not in by_zip
    assert by_zip["98101"]["median_value"] == 720000
    assert by_zip["98101"]["yoy_pct"] == 4.2
    assert "history" not in by_zip["98101"]  # not in GeoJSON
    assert "yoy_pct" not in by_zip["98109"]  # omitted -> 'no data' for that metric
    assert "median_value" not in by_zip["98115"]  # no-data ZIP
    for f in fc["features"]:
        assert f["geometry"]["type"] == "Polygon"
