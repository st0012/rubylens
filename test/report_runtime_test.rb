# frozen_string_literal: true

require "json"
require "open3"
require_relative "test_helper"

class ReportRuntimeTest < Minitest::Test
  RUNTIME_PATH = File.expand_path("../assets/runtime/report.js", __dir__)

  def test_high_fanout_selection_is_bounded_and_globally_ranked
    result = run_ranking(<<~'JAVASCRIPT')
      const selected = { name: "Selected", category: "core" };
      const outgoing = Array.from({ length: 4096 }, (_, index) => route(selected, point(`Outgoing${index}`), 10_000 - index));
      const incoming = Array.from({ length: 2048 }, (_, index) => route(point(`Incoming${index}`), selected, 2_000 - index));
      outgoing.reverse().forEach(edge => appendRoute(outgoingRoutesByPoint, selected, edge));
      incoming.reverse().forEach(edge => appendRoute(incomingRoutesByPoint, selected, edge));
      selectedPoint = selected;
      selectionLocked = true;
      const cache = refreshSelectedRouteCache();
      const readsBeforeRepeatedDraws = visibilityReads;
      let stableIdentity = true;
      for (let index = 0; index < 1000; index += 1) {
        const entries = selectedRouteEntries();
        stableIdentity &&= entries === cache.entries && entries.length <= ROUTE_LIMIT;
      }
      process.stdout.write(JSON.stringify({
        entries: cache.entries.map(entry => [entry.direction, entry.route.count]),
        outgoingCount: cache.outgoingCount,
        incomingCount: cache.incomingCount,
        stableIdentity,
        visibilityReadsBefore: readsBeforeRepeatedDraws,
        visibilityReadsAfter: visibilityReads,
      }));
    JAVASCRIPT

    entries = result.fetch("entries")
    assert_equal(16, entries.length)
    assert_equal([*9985..10_000].reverse, entries.map(&:last))
    assert_equal(["outgoing"], entries.map(&:first).uniq)
    assert_equal(4096, result.fetch("outgoingCount"))
    assert_equal(2048, result.fetch("incomingCount"))
    assert(result.fetch("stableIdentity"))
    assert_equal(result.fetch("visibilityReadsBefore"), result.fetch("visibilityReadsAfter"))
  end

  def test_exact_ties_and_presented_groups_have_deterministic_order
    result = run_ranking(<<~'JAVASCRIPT')
      const selected = { name: "Selected", category: "core" };
      const outgoing = [route(selected, point("Shared"), 8), route(selected, point("Zulu"), 9)];
      const incoming = [route(point("Shared"), selected, 8), route(point("Alpha"), selected, 9)];
      outgoing.reverse().forEach(edge => appendRoute(outgoingRoutesByPoint, selected, edge));
      incoming.reverse().forEach(edge => appendRoute(incomingRoutesByPoint, selected, edge));
      selectedPoint = selected;
      selectionLocked = true;
      const entries = refreshSelectedRouteCache().entries;
      process.stdout.write(JSON.stringify({
        selected: entries.map(entry => `${entry.direction}:${entry.destination.name}`),
        outgoing: entries.filter(entry => entry.direction === "outgoing").map(entry => entry.destination.name),
        incoming: entries.filter(entry => entry.direction === "incoming").map(entry => entry.destination.name),
      }));
    JAVASCRIPT

    assert_equal(
      ["incoming:Alpha", "outgoing:Zulu", "outgoing:Shared", "incoming:Shared"],
      result.fetch("selected"),
    )
    assert_equal(["Zulu", "Shared"], result.fetch("outgoing"))
    assert_equal(["Alpha", "Shared"], result.fetch("incoming"))
  end

  def test_coarse_pointer_uses_eight_globally_ranked_entries
    result = run_ranking(<<~'JAVASCRIPT')
      coarsePointerQuery.matches = true;
      const selected = { name: "Selected", category: "core" };
      Array.from({ length: 10 }, (_, index) => route(selected, point(`Outgoing${index}`), 100 - index * 2))
        .reverse().forEach(edge => appendRoute(outgoingRoutesByPoint, selected, edge));
      Array.from({ length: 10 }, (_, index) => route(point(`Incoming${index}`), selected, 99 - index * 2))
        .reverse().forEach(edge => appendRoute(incomingRoutesByPoint, selected, edge));
      selectedPoint = selected;
      selectionLocked = true;
      const entries = refreshSelectedRouteCache().entries;
      process.stdout.write(JSON.stringify(entries.map(entry => [entry.direction, entry.route.count])));
    JAVASCRIPT

    assert_equal(8, result.length)
    assert_equal([*93..100].reverse, result.map(&:last))
    assert_equal(%w[outgoing incoming outgoing incoming outgoing incoming outgoing incoming], result.map(&:first))
  end

  def test_route_rows_are_decoded_once_then_released_from_the_model
    runtime = File.read(RUNTIME_PATH)
    decoder = runtime.match(
      /    function decodeReferenceRoutes\(rows\) \{.*?(?=^    if \(interactiveMode\) \{)/m,
    )&.to_s
    release = runtime[/^    delete model\.referenceRoutes;$/]
    refute_empty(decoder, "route decoder must stay extractable for the ownership test")
    refute_nil(release, "decoded route rows must be released from the model")
    refute_match(/\.map\(|\.filter\(/, decoder)

    script = <<~JAVASCRIPT
      const namespacePoints = [
        { name: "Core", category: "core" },
        { name: "Test", category: "tests" },
      ];
      const dependencyHubs = [{ name: "Gem", category: "dependencies", hub: true }];
      const coreReferenceRoutes = [];
      const outgoingRoutesByPoint = new Map();
      const incomingRoutesByPoint = new Map();
      const appendRoute = (routesByPoint, point, route) => {
        const routes = routesByPoint.get(point);
        if (routes) routes.push(route);
        else routesByPoint.set(point, [route]);
      };
      let coreReferenceOccurrenceCount = 0;
      const model = { referenceRoutes: [[0, 0, 1, 7], [0, 1, 0, 5], [1, 1, 0, 4], [99, 0, 1, 3]] };
      #{decoder}
      decodeReferenceRoutes(model.referenceRoutes || []);
      #{release.strip}
      const firstRoute = outgoingRoutesByPoint.get(namespacePoints[0])[0];
      const nonCoreRoute = outgoingRoutesByPoint.get(namespacePoints[1])[0];
      process.stdout.write(JSON.stringify({
        modelRetainsRows: Object.hasOwn(model, "referenceRoutes"),
        routeCount: [...outgoingRoutesByPoint.values()].reduce((sum, routes) => sum + routes.length, 0),
        coreRouteCount: coreReferenceRoutes.length,
        occurrenceCount: coreReferenceOccurrenceCount,
        firstSharedByIncoming: incomingRoutesByPoint.get(namespacePoints[1])[0] === firstRoute,
        firstSharedByCore: coreReferenceRoutes[0] === firstRoute,
        nonCoreSharedByIncoming: incomingRoutesByPoint.get(dependencyHubs[0]).includes(nonCoreRoute),
        nonCoreExcludedFromCore: !coreReferenceRoutes.includes(nonCoreRoute),
      }));
    JAVASCRIPT
    output, error, status = Open3.capture3("node", "-e", script)
    assert(status.success?, error)
    result = JSON.parse(output)

    refute(result.fetch("modelRetainsRows"))
    assert_equal(3, result.fetch("routeCount"))
    assert_equal(2, result.fetch("coreRouteCount"))
    assert_equal(12, result.fetch("occurrenceCount"))
    assert(result.fetch("firstSharedByIncoming"))
    assert(result.fetch("firstSharedByCore"))
    assert(result.fetch("nonCoreSharedByIncoming"))
    assert(result.fetch("nonCoreExcludedFromCore"))
  end

  private

  def run_ranking(assertion)
    runtime = File.read(RUNTIME_PATH)
    functions = runtime.match(
      /    function routeVisible\(route\) \{.*?(?=^    function createRouteGroup)/m,
    )&.to_s
    refute_empty(functions, "route ranking functions must stay extractable for the behavior test")
    script = <<~JAVASCRIPT
      let visibilityReads = 0;
      const visibleCategories = new Proxy({ core: true, tests: true, dependencies: true }, {
        get(target, property) { visibilityReads += 1; return target[property]; },
      });
      const outgoingRoutesByPoint = new Map();
      const incomingRoutesByPoint = new Map();
      const coarsePointerQuery = { matches: false };
      const ROUTE_LIMIT = 16;
      const COARSE_ROUTE_LIMIT = 8;
      const EMPTY_SELECTED_ROUTE_CACHE = Object.freeze({ point: null, outgoingCount: 0, incomingCount: 0, entries: Object.freeze([]) });
      let selectedPoint = null;
      let selectionLocked = false;
      let selectedRouteCache = EMPTY_SELECTED_ROUTE_CACHE;
      let projectionIndex = 0;
      const point = (name, category = "core") => ({ name, category, routeProjectionIndex: projectionIndex++ });
      const route = (source, target, count) => ({ source, target, count });
      const appendRoute = (routesByPoint, selected, edge) => {
        const routes = routesByPoint.get(selected);
        if (routes) routes.push(edge);
        else routesByPoint.set(selected, [edge]);
      };
      #{functions}
      #{assertion}
    JAVASCRIPT
    output, error, status = Open3.capture3("node", "-e", script)
    assert(status.success?, error)
    JSON.parse(output)
  end
end
