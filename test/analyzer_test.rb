# frozen_string_literal: true

require_relative "test_helper"

class AnalyzerTest < Minitest::Test
  def setup
    @analyzer = RubyLens::Analyzer.allocate
  end

  def test_adjusted_chain_removes_only_self_and_preserves_prepend_prefix
    chain = @analyzer.send(
      :adjusted_chain,
      "name" => "Example",
      "ancestors" => ["PrependedOne", "PrependedTwo", "Example", "Base", "Object"],
    )

    assert_equal("exactly_once", chain.fetch("quality"))
    assert_equal(2, chain.fetch("self_index"))
    assert_equal(["PrependedOne", "PrependedTwo"], chain.fetch("prefix"))
    assert_equal(["PrependedOne", "PrependedTwo", "Base", "Object"], chain.fetch("adjusted"))
  end

  def test_descendant_rankings_distinguish_strict_source_from_source_or_both
    groups = {
      "SourceHub" => group("source"),
      "BothHub" => group("both"),
      "SourceChild" => group("source"),
      "BothChild" => group("both"),
      "TestChild" => group("test"),
    }
    @analyzer.instance_variable_set(:@workspace_groups, groups)
    @analyzer.instance_variable_set(:@full_origin_names, Hash.new { |hash, key| hash[key] = Set.new(["workspace"]) })
    populations = groups.map do |name, group|
      { "name" => name, "kind" => "class", "source_scope" => @analyzer.send(:source_scope, group) }
    end
    declarations = groups.to_h do |name, _group|
      descendants = if name.end_with?("Hub")
        [name, "SourceChild", "BothChild", "TestChild"]
      else
        [name]
      end
      [name, { "descendants" => descendants }]
    end

    analysis = @analyzer.send(:descendant_analysis, populations, groups.keys.to_set, declarations)

    strict_names = analysis.fetch("top_source_descendant_hubs").map { |record| record.fetch("name") }
    combined_names = analysis.fetch("top_source_or_both_descendant_hubs").map { |record| record.fetch("name") }
    assert_includes(strict_names, "SourceHub")
    refute_includes(strict_names, "BothHub")
    assert_includes(combined_names, "BothHub")
    source_hub = analysis.fetch("top_source_descendant_hubs").find { |record| record["name"] == "SourceHub" }
    assert_equal(1, source_hub.fetch("workspace_source_only_descendant_count"))
    assert_equal(2, source_hub.fetch("workspace_source_descendant_count"))
  end

  def test_identity_partition_uses_canonical_declaration_kind
    names = Set["RealClass", "ConditionalAlias"]
    canonical_kinds = { "RealClass" => "class", "ConditionalAlias" => "constant_alias" }
    namespace_declarations = { "RealClass" => {}, "ConditionalAlias" => {} }

    result = @analyzer.send(:semantic_namespace_names, names, canonical_kinds, namespace_declarations)

    assert_equal(Set["RealClass"], result)
  end

  def test_aggregate_status_propagates_dependency_and_input_gaps
    assert_equal(
      "partial",
      @analyzer.send(
        :aggregate_status,
        "workspace_summary_status" => "complete",
        "dependency_analysis_status" => "partial",
        "workspace_input_document_coverage_complete" => true,
      ),
    )
    assert_equal(
      "complete",
      @analyzer.send(
        :aggregate_status,
        "workspace_summary_status" => "complete",
        "dependency_analysis_status" => "complete",
        "workspace_input_document_coverage_complete" => true,
      ),
    )
  end

  private

  def group(scope)
    scopes = scope == "both" ? { "source" => 1, "test" => 1 } : { scope => 1 }
    {
      "source_scopes" => scopes,
      "sites" => {},
      "raw_count" => 0,
      "definition_kinds" => Set.new(["class_definition"]),
    }
  end
end
