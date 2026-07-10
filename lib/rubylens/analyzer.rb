# frozen_string_literal: true

require "fileutils"
require "json"
require "set"
require "time"
require "zlib"

require_relative "dependency_analyzer"
require_relative "extractor"

module RubyLens
  class Analyzer
    NAMESPACE_DEFINITION_KINDS = %w[class_definition module_definition].freeze
    SEMANTIC_NAMESPACE_KINDS = %w[class module].freeze
    QUANTILES = { "p50" => 0.50, "p75" => 0.75, "p90" => 0.90, "p95" => 0.95, "p99" => 0.99 }.freeze
    TOP_LIMIT = 20

    def initialize(target_root:, control_dir:, workspace_dir:, output_path:, target_lockfile: nil)
      @target_root = File.realpath(target_root)
      @control_dir = File.expand_path(control_dir)
      @workspace_dir = File.expand_path(workspace_dir)
      @output_path = File.expand_path(output_path)
      @target_lockfile = target_lockfile && File.expand_path(target_lockfile)
      @timings = {}
    end

    def run
      total_started = monotonic
      timed("workspace_preflight") { WorkspacePreflight.new(@target_root).validate! }
      @control_summary = JSON.parse(File.read(File.join(@control_dir, "summary.json")))
      @workspace_summary = JSON.parse(File.read(File.join(@workspace_dir, "summary.json")))
      timed("definitions") { scan_definitions }
      dependency_analysis = timed("dependencies") do
        DependencyAnalyzer.new(
          target_root: @target_root,
          target_lockfile: @target_lockfile,
          raw_ledger: @workspace_dependencies,
          exact_origins: @workspace_summary.dig("origins", "by_exact_origin") || {},
        ).run
      end
      declaration_analysis = timed("declarations") { analyze_declarations(dependency_analysis) }
      inputs = input_analysis(dependency_analysis)
      status_basis = {
        "workspace_summary_status" => @workspace_summary.fetch("status"),
        "dependency_analysis_status" => dependency_analysis.fetch("status"),
        "workspace_input_document_coverage_complete" => inputs.dig("workspace_input_document_coverage", "complete"),
      }
      overall_status = aggregate_status(status_basis)
      @timings["total"] = elapsed(total_started)

      payload = {
        "schema" => "rubylens.analysis.v1",
        "generated_at" => Time.now.utc.iso8601,
        "status" => overall_status,
        "analysis_computation_status" => "complete",
        "status_basis" => status_basis,
        "target" => @workspace_summary.fetch("target"),
        "index_safety" => WorkspacePreflight.research_mode_metadata(preflight: "passed_during_analysis"),
        "inputs" => inputs,
        "population" => declaration_analysis.fetch("population"),
        "ancestry" => declaration_analysis.fetch("ancestry"),
        "descendants" => declaration_analysis.fetch("descendants"),
        "reopenings" => reopening_analysis,
        "origins" => origin_analysis,
        "control_vs_workspace" => {
          "relationship_resolution" => relationship_resolution,
          "ancestor_transitions" => declaration_analysis.fetch("ancestor_transitions"),
        },
        "dependencies" => dependency_analysis,
        "rbs_policy" => rbs_policy(dependency_analysis),
        "timings_seconds" => @timings.transform_values { |value| value.round(6) },
        "limitations" => [
          "All project rankings are restricted to declarations backed by workspace class/module definitions; global full-index rankings are intentionally not reused.",
          "A definition-backed name is not necessarily a canonical class/module declaration; conditional aliases and class/module fixture collisions are reported as identity ambiguities.",
          "Entries before self in RubyDex ancestry are preserved as a prepend-prefix candidate, but the released API does not label each ancestry relation.",
          "Workspace-only descendant reach intersects RubyDex descendants with the canonical workspace namespace set; external descendants remain excluded from project rankings.",
          "Cross-origin and multi-site merges are static index merges, not proof that all bodies coexist at runtime.",
          "Dependency runtime use remains unproven; Graph#index_workspace eagerly indexes the locked bundle.",
          "Rubydex 0.2.9 method visibility is omitted because module_function visibility translation can abort the process.",
          "MCP loads Rubydex configuration while the direct extraction Graph does not; neither analyzed target contained rubydex.toml.",
        ],
      }
      write_json(payload)
      payload
    end

    private

    def scan_definitions
      workspace_inputs = raw_payload(@workspace_dir, "inputs")
      workspace_documents = raw_payload(@workspace_dir, "documents")
      workspace_definitions = raw_payload(@workspace_dir, "definitions")
      @workspace_dependencies = raw_payload(@workspace_dir, "dependencies")
      control_definitions = raw_payload(@control_dir, "definitions")

      document_categories = workspace_documents.fetch("records").map { |document| document.fetch("path_category") }
      @workspace_document_paths = workspace_documents.fetch("records").filter_map do |document|
        document.fetch("path") if document.dig("origin", "kind") == "workspace"
      end.to_set
      @selected_input_paths = workspace_inputs.fetch("records").map { |input| input.fetch("path") }.to_set
      @workspace_groups = Hash.new do |hash, name|
        hash[name] = { "sites" => {}, "raw_count" => 0, "definition_kinds" => Set.new, "source_scopes" => Hash.new(0) }
      end
      @workspace_all_definition_groups = Hash.new do |hash, name|
        hash[name] = { "definition_kinds" => Set.new, "paths" => Set.new }
      end
      @full_origin_names = Hash.new { |hash, name| hash[name] = Set.new }
      @control_origin_names = Hash.new { |hash, name| hash[name] = Set.new }
      @cross_origin_groups = Hash.new { |hash, name| hash[name] = { "exact" => Set.new, "kinds" => Set.new } }
      @origin_counts_by_kind = Hash.new { |hash, key| hash[key] = { "definitions" => 0, "namespace_definitions" => 0 } }
      @origin_counts_exact = Hash.new { |hash, key| hash[key] = { "definitions" => 0, "namespace_definitions" => 0 } }
      @full_class_sites = Hash.new { |hash, key| hash[key] = [] }
      @control_class_sites = Hash.new { |hash, key| hash[key] = [] }
      @full_mixin_counts = { "resolved" => 0, "unresolved" => 0 }
      @control_mixin_counts = { "resolved" => 0, "unresolved" => 0 }
      @control_definitions_by_path = Hash.new { |hash, path| hash[path] = { "count" => 0, "declarations" => Set.new } }

      workspace_definitions.fetch("records").each do |definition|
        origin = definition.dig("location", "origin") || { "kind" => "unknown" }
        exact = OriginClassifier.key(origin)
        namespace = namespace_definition?(definition)
        increment_origin(@origin_counts_by_kind[origin.fetch("kind")], namespace)
        increment_origin(@origin_counts_exact[exact], namespace)
        if namespace && definition["declaration"]
          name = definition.fetch("declaration")
          @full_origin_names[name] << exact
          @cross_origin_groups[name]["exact"] << exact
          @cross_origin_groups[name]["kinds"] << origin.fetch("kind")
        end
        next unless origin.fetch("kind") == "workspace"

        if definition["declaration"]
          all_group = @workspace_all_definition_groups[definition.fetch("declaration")]
          all_group.fetch("definition_kinds") << definition.fetch("kind")
          all_group.fetch("paths") << definition.dig("location", "path") if definition.dig("location", "path")
        end

        record_relationship_site(@full_class_sites, definition) if definition["kind"] == "class_definition"
        count_mixins(@full_mixin_counts, definition)
        next unless namespace && definition["declaration"]

        group = @workspace_groups[definition.fetch("declaration")]
        group["raw_count"] += 1
        group["definition_kinds"] << definition.fetch("kind")
        category = document_categories[definition["document_index"]] || path_category(definition.dig("location", "path"))
        group["source_scopes"][category] += 1
        group["sites"][definition_site_key(definition)] = compact_site(definition, category)
      end

      control_definitions.fetch("records").each do |definition|
        origin = definition.dig("location", "origin")
        next unless origin

        if namespace_definition?(definition) && definition["declaration"]
          @control_origin_names[definition.fetch("declaration")] << OriginClassifier.key(origin)
        end
        next unless origin.fetch("kind") == "workspace"

        path = definition.dig("location", "path")
        if path
          bucket = @control_definitions_by_path[path]
          bucket["count"] += 1
          bucket["declarations"] << definition["declaration"] if definition["declaration"]
        end
        record_relationship_site(@control_class_sites, definition) if definition["kind"] == "class_definition"
        count_mixins(@control_mixin_counts, definition)
      end
    end

    def analyze_declarations(dependencies)
      workspace_declarations = raw_payload(@workspace_dir, "declarations")
      control_declarations = raw_payload(@control_dir, "declarations")
      workspace_declaration_records = workspace_declarations.fetch("records")
      canonical_kinds = workspace_declaration_records.to_h { |record| [record.fetch("name"), record.fetch("kind")] }
      full = namespace_declaration_map(workspace_declaration_records)
      control = namespace_declaration_map(control_declarations.fetch("records"))
      definition_backed_names = @workspace_groups.keys.to_set
      semantic_names = semantic_namespace_names(definition_backed_names, canonical_kinds, full)
      any_workspace_definition_names = @workspace_all_definition_groups.keys.select do |name|
        SEMANTIC_NAMESPACE_KINDS.include?(canonical_kinds[name])
      end.to_set
      constant_shaped_exclusions = (any_workspace_definition_names - semantic_names).sort.map do |name|
        group = @workspace_all_definition_groups.fetch(name)
        {
          "name" => name,
          "canonical_declaration_kind" => canonical_kinds.fetch(name),
          "workspace_definition_kinds" => group.fetch("definition_kinds").to_a.sort,
          "sample_paths" => group.fetch("paths").to_a.sort.first(3),
        }
      end
      mismatches = (definition_backed_names - semantic_names).sort.map do |name|
        {
          "name" => name,
          "definition_kinds" => @workspace_groups.fetch(name).fetch("definition_kinds").to_a.sort,
          "canonical_declaration_kind" => canonical_kinds[name],
        }
      end

      population_records = semantic_names.sort.map do |name|
        group = @workspace_groups.fetch(name)
        {
          "name" => name,
          "kind" => full.fetch(name).fetch("kind"),
          "source_scope" => source_scope(group),
          "workspace_definition_count" => group.fetch("sites").length,
          "definition_kinds" => group.fetch("definition_kinds").to_a.sort,
        }
      end
      full_chains, ancestry = ancestry_analysis(population_records, full)
      descendants = descendant_analysis(population_records, semantic_names, full)
      transitions = ancestor_transition_analysis(population_records, full_chains, control, dependencies)

      {
        "population" => {
          "workspace_namespaces" => {
            "methodology" => "Authoritative workspace class_definition/module_definition sites joined to canonical declarations.",
            "definition_records" => @workspace_groups.values.sum { |group| group.fetch("raw_count") },
            "unique_definition_sites" => @workspace_groups.values.sum { |group| group.fetch("sites").length },
            "definition_backed_names" => definition_backed_names.length,
            "semantic_class_module_names" => semantic_names.length,
            "population_label" => "explicit class/module definition-backed namespaces",
            "canonical_class_module_declarations_with_any_workspace_definition" => any_workspace_definition_names.length,
            "class_module_shaped_constant_only_exclusion_count" => constant_shaped_exclusions.length,
            "class_module_shaped_constant_only_exclusion_examples" => constant_shaped_exclusions.first(TOP_LIMIT),
            "canonical_kind_mismatch_count" => mismatches.length,
            "by_canonical_kind" => tally(population_records) { |record| record.fetch("kind") },
            "by_source_scope" => tally(population_records) { |record| record.fetch("source_scope") },
            "definition_records_by_source_scope" => tally_weighted(@workspace_groups.values) do |group|
              group.fetch("source_scopes")
            end,
            "identity_ambiguities" => {
              "canonical_kind_mismatches" => mismatches,
              "class_and_module_definition_names" => @workspace_groups.filter_map do |name, group|
                name if group.fetch("definition_kinds").length > 1
              end.sort,
            },
          },
        },
        "ancestry" => ancestry,
        "descendants" => descendants,
        "ancestor_transitions" => transitions,
      }
    end

    def ancestry_analysis(population_records, declarations)
      quality = {
        "eligible" => population_records.length,
        "self_exactly_once" => 0,
        "self_missing" => 0,
        "self_multiple" => 0,
        "self_index_counts" => Hash.new(0),
      }
      chains = {}
      population_records.each do |population|
        declaration = declarations.fetch(population.fetch("name"))
        chain = adjusted_chain(declaration)
        chains[population.fetch("name")] = chain.merge("raw" => declaration.fetch("ancestors"))
        case chain.fetch("quality")
        when "exactly_once"
          quality["self_exactly_once"] += 1
          quality["self_index_counts"][chain.fetch("self_index").to_s] += 1
        when "missing" then quality["self_missing"] += 1
        when "multiple" then quality["self_multiple"] += 1
        end
      end

      valid = population_records.select { |population| chains.fetch(population.fetch("name"))["quality"] == "exactly_once" }
      distributions = {
        "all_workspace_namespaces" => distribution(
          valid.map { |population| chains.fetch(population.fetch("name")).fetch("adjusted").length },
          "canonical workspace class/module declarations with exactly one self entry",
        ),
      }
      %w[source test both].each do |scope|
        cohort = valid.select { |population| population["source_scope"] == scope }
        distributions[scope] = distribution(
          cohort.map { |population| chains.fetch(population.fetch("name")).fetch("adjusted").length },
          "workspace namespaces in the #{scope} definition cohort with exactly one self entry",
        )
      end
      deepest = valid.sort_by do |population|
        [-chains.fetch(population.fetch("name")).fetch("adjusted").length, population.fetch("name")]
      end.first(TOP_LIMIT).map do |population|
        chain = chains.fetch(population.fetch("name"))
        population.merge(
          "ancestor_count_excluding_self" => chain.fetch("adjusted").length,
          "self_index" => chain.fetch("self_index"),
          "prepend_prefix_candidate" => chain.fetch("prefix"),
        )
      end
      prefix_records = valid.filter_map do |population|
        chain = chains.fetch(population.fetch("name"))
        next if chain.fetch("self_index").zero?

        population.merge(
          "self_index" => chain.fetch("self_index"),
          "entries_before_self_count" => chain.fetch("prefix").length,
          "prepend_prefix_candidate" => chain.fetch("prefix"),
          "ancestor_count_excluding_self" => chain.fetch("adjusted").length,
        )
      end

      [chains, {
        "methodology" => {
          "self_adjustment" => "Find exactly one ancestry entry equal to the declaration name, preserve entries before it, and remove only that self entry.",
          "prepend_prefix" => "Entries before self are reported as prepend-prefix candidates because the released ancestry API does not expose relation kinds.",
          "quantiles" => "nearest-rank: sorted[ceil(p*n)-1]",
        },
        "quality" => quality.merge("self_index_counts" => quality.fetch("self_index_counts").sort.to_h),
        "distributions" => distributions,
        "deepest_workspace_namespaces" => deepest,
        "prepend_prefix_candidates" => prefix_records.sort_by { |record| [-record.fetch("self_index"), record.fetch("name")] },
      }]
    end

    def descendant_analysis(population_records, semantic_names, declarations)
      source_population = population_records.count { |record| %w[source both].include?(record.fetch("source_scope")) }
      injection_threshold = [110, (source_population * 0.04).ceil].max
      records = population_records.map do |population|
        descendants = declarations.fetch(population.fetch("name")).fetch("descendants").reject do |name|
          name == population.fetch("name")
        end.uniq
        workspace = descendants.select { |name| semantic_names.include?(name) }
        workspace_source = workspace.select { |name| %w[source both].include?(source_scope(@workspace_groups.fetch(name))) }
        workspace_source_only = workspace.select { |name| source_scope(@workspace_groups.fetch(name)) == "source" }
        by_scope = workspace.each_with_object(Hash.new(0)) do |name, counts|
          counts[source_scope(@workspace_groups.fetch(name))] += 1
        end
        source_reach_ratio = source_population.zero? ? 0.0 : workspace_source.length.fdiv(source_population)
        injection_candidate = workspace_source.length >= injection_threshold || source_reach_ratio >= 0.8
        population.merge(
          "workspace_descendant_count" => workspace.length,
          "workspace_source_descendant_count" => workspace_source.length,
          "workspace_source_only_descendant_count" => workspace_source_only.length,
          "external_or_noncanonical_descendant_count" => descendants.length - workspace.length,
          "workspace_descendants_by_source_scope" => by_scope.sort.to_h,
          "cross_origin_definition_merge" => @full_origin_names.fetch(population.fetch("name"), Set.new).any? do |origin|
            origin != "workspace"
          end,
          "global_injection_candidate" => injection_candidate,
          "global_injection_candidate_reason" => if injection_candidate
            "Static heuristic: source-or-both transitive reach is at least #{injection_threshold} or 80% of the source cohort; inspect inverted relation evidence before treating this as project structure."
          end,
          "sample" => workspace.first(10),
        )
      end
      {
        "methodology" => "Transitive reach only: remove self by equality, deduplicate, and intersect with canonical workspace class/module names. This is not a direct-child edge list.",
        "distribution" => distribution(records.map { |record| record.fetch("workspace_descendant_count") }, "canonical workspace namespaces"),
        "zero_workspace_descendants" => records.count { |record| record.fetch("workspace_descendant_count").zero? },
        "top_workspace_hubs" => records.sort_by do |record|
          [-record.fetch("workspace_descendant_count"), record.fetch("name")]
        end.first(TOP_LIMIT),
        "top_source_descendant_hubs" => records.select do |record|
          record.fetch("source_scope") == "source"
        end.sort_by do |record|
          [-record.fetch("workspace_source_only_descendant_count"), record.fetch("name")]
        end.first(TOP_LIMIT),
        "top_source_or_both_descendant_hubs" => records.select do |record|
          %w[source both].include?(record.fetch("source_scope"))
        end.sort_by do |record|
          [-record.fetch("workspace_source_descendant_count"), record.fetch("name")]
        end.first(TOP_LIMIT),
        "top_project_structural_candidates" => records.select do |record|
          record.fetch("source_scope") == "source" && !record.fetch("global_injection_candidate")
        end.sort_by do |record|
          [-record.fetch("workspace_source_only_descendant_count"), record.fetch("name")]
        end.first(TOP_LIMIT),
        "top_strict_source_descendant_hubs" => records.select do |record|
          record.fetch("source_scope") == "source" && !record.fetch("global_injection_candidate")
        end.sort_by do |record|
          [-record.fetch("workspace_source_only_descendant_count"), record.fetch("name")]
        end.first(TOP_LIMIT),
        "source_ranking_policy" => {
          "top_source_descendant_hubs" => "selected declaration has strict source scope; metric counts strict source-only transitive descendants",
          "top_source_or_both_descendant_hubs" => "selected declaration has source or both scope; metric counts source plus both-scope transitive descendants",
          "top_project_structural_candidates" => "strict source-only ranking after removing heuristic global-injection candidates; candidates are not proof of direct structure",
          "top_strict_source_descendant_hubs" => "strict source-only transitive reach after separating heuristic global-injection candidates",
        },
        "global_injection_candidate_methodology" => {
          "status" => "heuristic_not_proven",
          "workspace_source_reach_threshold" => injection_threshold,
          "workspace_source_reach_ratio_threshold" => 0.8,
          "reason" => "Very broad absolute or proportional transitive reach can indicate globally included/prepended behavior; direct relation inversion is required for proof.",
        },
      }
    end

    def ancestor_transition_analysis(population_records, full_chains, control_declarations, dependencies)
      dependency_by_name = dependencies.fetch("packages", []).to_h { |package| [package.fetch("name"), package] }
      changes = []
      compared = 0
      missing_control = 0
      population_records.each do |population|
        name = population.fetch("name")
        control = control_declarations[name]
        unless control
          missing_control += 1
          next
        end
        control_chain = adjusted_chain(control)
        full_chain = full_chains.fetch(name)
        next unless control_chain["quality"] == "exactly_once" && full_chain["quality"] == "exactly_once"

        compared += 1
        added = ordered_difference(full_chain.fetch("adjusted"), control_chain.fetch("adjusted"))
        removed = ordered_difference(control_chain.fetch("adjusted"), full_chain.fetch("adjusted"))
        next if added.empty? && removed.empty?

        changes << population.merge(
          "control_ancestor_count_excluding_self" => control_chain.fetch("adjusted").length,
          "workspace_ancestor_count_excluding_self" => full_chain.fetch("adjusted").length,
          "added" => added.map { |ancestor| enrich_ancestor(ancestor, @full_origin_names, dependency_by_name) },
          "removed" => removed.map { |ancestor| enrich_ancestor(ancestor, @control_origin_names, dependency_by_name) },
          "boundary_transitions" => boundary_transitions(full_chain.fetch("raw"), dependency_by_name),
          "signature" => { "added" => added, "removed" => removed },
        )
      end
      selected = changes.group_by { |change| JSON.generate(change.fetch("signature")) }.values.map do |group|
        representative = group.min_by { |change| change.fetch("name") }
        representative.merge("same_transition_signature_count" => group.length).tap { |record| record.delete("signature") }
      end.sort_by do |record|
        [-record.fetch("added").length, -record.fetch("removed").length, record.fetch("name")]
      end.first(TOP_LIMIT)
      {
        "methodology" => "Compare adjusted canonical workspace ancestry arrays; selected records deduplicate identical added/removed signatures.",
        "compared" => compared,
        "missing_control_declaration" => missing_control,
        "changed" => changes.length,
        "added_ancestor_entries" => changes.sum { |change| change.fetch("added").length },
        "removed_ancestor_entries" => changes.sum { |change| change.fetch("removed").length },
        "selected_signature_representatives" => selected,
      }
    end

    def reopening_analysis
      records = @workspace_groups.map do |name, group|
        count = group.fetch("sites").length
        {
          "name" => name,
          "workspace_definition_count" => count,
          "workspace_reopen_event_count" => [count - 1, 0].max,
          "raw_workspace_definition_record_count" => group.fetch("raw_count"),
          "duplicate_site_record_count" => group.fetch("raw_count") - count,
          "definition_kinds" => group.fetch("definition_kinds").to_a.sort,
          "source_scope" => source_scope(group),
          "sites" => group.fetch("sites").values.sort_by { |site| [site.fetch("path"), site.fetch("start_line")] },
        }
      end
      reopened = records.select { |record| record.fetch("workspace_definition_count") > 1 }
      {
        "methodology" => "Unique workspace namespace definition sites keyed by kind, relative path, and zero-based range; dependency/RBS definitions excluded.",
        "declarations_with_multiple_workspace_sites" => reopened.length,
        "workspace_reopen_events" => reopened.sum { |record| record.fetch("workspace_reopen_event_count") },
        "duplicate_site_records" => records.sum { |record| record.fetch("duplicate_site_record_count") },
        "records" => reopened.sort_by { |record| [-record.fetch("workspace_definition_count"), record.fetch("name")] },
      }
    end

    def origin_analysis
      merges = @cross_origin_groups.filter_map do |name, group|
        next unless group.fetch("exact").length > 1

        {
          "name" => name,
          "exact_origins" => group.fetch("exact").to_a.sort,
          "origin_kinds" => group.fetch("kinds").to_a.sort,
          "involves_workspace" => group.fetch("kinds").include?("workspace"),
        }
      end.sort_by { |record| [-record.fetch("exact_origins").length, record.fetch("name")] }
      {
        "methodology" => "Counts use the full authoritative definition stream; exact origin preserves gem/version and RBS version/section.",
        "definition_counts" => {
          "by_kind" => sorted_count_hash(@origin_counts_by_kind),
          "by_exact_origin" => sorted_count_hash(@origin_counts_exact),
        },
        "cross_origin_namespace_merges" => {
          "cross_exact_origin_count" => merges.length,
          "cross_origin_kind_count" => merges.count { |record| record.fetch("origin_kinds").length > 1 },
          "involving_workspace_count" => merges.count { |record| record.fetch("involves_workspace") },
          "records" => merges,
        },
      }
    end

    def relationship_resolution
      matched_keys = @control_class_sites.keys & @full_class_sites.keys
      ambiguous = matched_keys.count do |key|
        @control_class_sites.fetch(key).length != 1 || @full_class_sites.fetch(key).length != 1
      end
      counts = Hash.new(0)
      examples = []
      matched_keys.each do |key|
        control = @control_class_sites.fetch(key)
        full = @full_class_sites.fetch(key)
        next unless control.length == 1 && full.length == 1

        control_record = control.first
        full_record = full.first
        control_ref = control_record["superclass"]
        full_ref = full_record["superclass"]
        if control_ref.nil? && full_ref.nil?
          counts["no_explicit_superclass_both"] += 1
          next
        elsif control_ref.nil?
          counts["superclass_added"] += 1
          next
        elsif full_ref.nil?
          counts["superclass_removed"] += 1
          next
        end

        counts["eligible_explicit_superclass_sites"] += 1
        control_resolved = control_ref["resolved"] == true
        full_resolved = full_ref["resolved"] == true
        counts["control_resolved"] += 1 if control_resolved
        counts["workspace_resolved"] += 1 if full_resolved
        state = if !control_resolved && full_resolved
          "unresolved_to_resolved"
        elsif control_resolved && !full_resolved
          "resolved_to_unresolved"
        elsif control_resolved && full_resolved
          control_ref["target"] == full_ref["target"] ? "resolved_same_target" : "resolved_changed_target"
        else
          "unresolved_both"
        end
        counts[state] += 1
        if state == "unresolved_to_resolved" && examples.length < TOP_LIMIT
          examples << {
            "declaration" => full_record["declaration"],
            "path" => full_record["path"],
            "control_name" => control_ref["name"],
            "workspace_target" => full_ref["target"],
          }
        end
      end
      eligible = counts["eligible_explicit_superclass_sites"]
      control_rate = eligible.zero? ? nil : counts["control_resolved"].fdiv(eligible)
      workspace_rate = eligible.zero? ? nil : counts["workspace_resolved"].fdiv(eligible)
      {
        "superclass" => {
          "methodology" => "Match workspace class_definition sites by kind, path, and zero-based range; compare non-null superclass references.",
          "counts" => counts.sort.to_h,
          "ambiguous_duplicate_site_keys" => ambiguous,
          "control_resolution_rate" => control_rate&.round(6),
          "workspace_resolution_rate" => workspace_rate&.round(6),
          "resolution_delta_percentage_points" => if control_rate && workspace_rate
            ((workspace_rate - control_rate) * 100).round(6)
          end,
          "unresolved_to_resolved_examples" => examples,
        },
        "mixins" => {
          "methodology" => "Independent counts of workspace namespace-definition mixin references; relationship occurrences are not rematched across snapshots.",
          "control" => @control_mixin_counts,
          "workspace" => @full_mixin_counts,
        },
      }
    end

    def input_analysis(dependencies)
      missing = (@selected_input_paths - @workspace_document_paths).sort.map do |path|
        control = @control_definitions_by_path.fetch(path, { "count" => 0, "declarations" => Set.new })
        {
          "path" => path,
          "control_definition_count" => control.fetch("count"),
          "control_declarations" => control.fetch("declarations").to_a.compact.sort,
        }
      end
      extra = (@workspace_document_paths - @selected_input_paths).sort
      {
        "control_summary_status" => @control_summary.fetch("status"),
        "workspace_summary_status" => @workspace_summary.fetch("status"),
        "workspace_index_errors" => @workspace_summary.dig("errors", "index"),
        "workspace_truncations" => @workspace_summary.fetch("truncations"),
        "workspace_input_document_coverage" => {
          "selected_git_inputs" => @selected_input_paths.length,
          "workspace_documents" => @workspace_document_paths.length,
          "coverage_ratio" => if @selected_input_paths.empty?
            nil
          else
            ((@selected_input_paths & @workspace_document_paths).length.fdiv(@selected_input_paths.length)).round(6)
          end,
          "missing_selected_inputs" => missing,
          "extra_workspace_documents" => extra,
          "complete" => missing.empty? && extra.empty?,
        },
        "dependency_require_root_coverage" => dependencies["require_root_coverage"],
      }
    end

    def rbs_policy(dependencies)
      counts = @origin_counts_by_kind.fetch("rbs", { "definitions" => 0, "namespace_definitions" => 0 })
      package = dependencies.fetch("packages", []).find { |candidate| candidate["name"] == "rbs" }
      {
        "observed" => counts.fetch("definitions").positive?,
        "definition_count" => counts.fetch("definitions"),
        "namespace_definition_count" => counts.fetch("namespace_definitions"),
        "locked_package" => package && package.slice("name", "version", "primary_role", "location_scope"),
        "rubydex_behavior" => "Graph#index_workspace searches Gem.path for the latest installed rbs gem and then adds core and stdlib trees.",
        "product_requirement" => "RubyLens must explicitly pin or disable an RBS policy instead of inheriting ambient Gem.path.",
      }
    end

    def raw_payload(directory, name)
      path = File.join(directory, "raw", "#{name}.json.gz")
      parsed = Zlib::GzipReader.open(path) { |gzip| JSON.parse(gzip.read) }
      parsed.fetch("payload")
    end

    def namespace_declaration_map(records)
      records.each_with_object({}) do |record, result|
        result[record.fetch("name")] = record if record.key?("ancestors")
      end
    end

    def namespace_definition?(definition)
      NAMESPACE_DEFINITION_KINDS.include?(definition["kind"])
    end

    def increment_origin(bucket, namespace)
      bucket["definitions"] += 1
      bucket["namespace_definitions"] += 1 if namespace
    end

    def definition_site_key(definition)
      location = definition.fetch("location")
      [definition.fetch("kind"), location["path"], location["start_line"], location["start_column"], location["end_line"], location["end_column"]]
    end

    def compact_site(definition, category)
      location = definition.fetch("location")
      {
        "kind" => definition.fetch("kind"),
        "path" => location.fetch("path"),
        "start_line" => location.fetch("start_line"),
        "start_column" => location.fetch("start_column"),
        "end_line" => location.fetch("end_line"),
        "end_column" => location.fetch("end_column"),
        "source_scope" => category,
      }
    end

    def record_relationship_site(collection, definition)
      record = {
        "declaration" => definition["declaration"],
        "path" => definition.dig("location", "path"),
        "superclass" => definition["superclass"],
      }
      collection[definition_site_key(definition)] << record
    end

    def count_mixins(counts, definition)
      definition.fetch("mixins", []).each do |mixin|
        reference = mixin.fetch("constant_reference")
        counts[reference["resolved"] == true ? "resolved" : "unresolved"] += 1
      end
    end

    def source_scope(group)
      scopes = group.fetch("source_scopes").select { |_scope, count| count.positive? }.keys.sort
      return scopes.first if scopes.length == 1
      return "both" if scopes == %w[source test]

      scopes.empty? ? "unknown" : "mixed"
    end

    def adjusted_chain(declaration)
      name = declaration.fetch("name")
      ancestors = declaration.fetch("ancestors")
      indices = ancestors.each_index.select { |index| ancestors[index] == name }
      return { "quality" => "missing", "self_index" => nil, "prefix" => [], "adjusted" => ancestors } if indices.empty?
      return { "quality" => "multiple", "self_index" => nil, "prefix" => [], "adjusted" => ancestors } if indices.length > 1

      index = indices.first
      {
        "quality" => "exactly_once",
        "self_index" => index,
        "prefix" => ancestors.first(index),
        "adjusted" => ancestors.each_with_index.filter_map { |ancestor, position| ancestor unless position == index },
      }
    end

    def distribution(values, population_filter)
      sorted = values.sort
      result = {
        "population" => sorted.length,
        "filter" => population_filter,
        "method" => "nearest-rank sorted[ceil(p*n)-1]",
      }
      return result.merge("min" => nil, "max" => nil, "mean" => nil).merge(QUANTILES.keys.to_h { |key| [key, nil] }) if sorted.empty?

      result.merge(
        "min" => sorted.first,
        "max" => sorted.last,
        "mean" => (sorted.sum.fdiv(sorted.length)).round(6),
      ).merge(QUANTILES.to_h { |key, quantile| [key, sorted[(quantile * sorted.length).ceil - 1]] })
    end

    def ordered_difference(left, right)
      remaining = right.tally
      left.filter_map do |item|
        if remaining[item].to_i.positive?
          remaining[item] -= 1
          nil
        else
          item
        end
      end
    end

    def enrich_ancestor(name, origin_map, dependency_by_name)
      origins = origin_map.fetch(name, Set.new).to_a.sort
      {
        "name" => name,
        "origins" => origins.map { |origin| { "origin" => origin, "dependency_role" => dependency_role(origin, dependency_by_name) } },
      }
    end

    def boundary_transitions(chain, dependency_by_name)
      entries = chain.map { |name| enrich_ancestor(name, @full_origin_names, dependency_by_name) }
      entries.each_cons(2).with_index.filter_map do |(from, to), index|
        from_origin = primary_origin(from)
        to_origin = primary_origin(to)
        next if from_origin == to_origin

        {
          "after_index" => index,
          "from" => from,
          "to" => to,
        }
      end
    end

    def primary_origin(entry)
      origins = entry.fetch("origins")
      origins.find { |origin| origin["origin"] == "workspace" } || origins.first || { "origin" => "unknown", "dependency_role" => "unknown" }
    end

    def dependency_role(origin, dependency_by_name)
      return "workspace" if origin == "workspace"
      return "core_or_stdlib_signature" if origin.start_with?("rbs:") || %w[stdlib builtin].include?(origin)
      return "rubydex_tooling" if origin.start_with?("tooling_gem:")
      return "unknown" unless (match = origin.match(/\Agem:([^@]+)@/))

      package = dependency_by_name[match[1]]
      return "indexed_gem_unknown_role" unless package
      return "workspace_package" if package["location_scope"] == "workspace"

      {
        "direct_runtime" => "declared_runtime_dependency",
        "direct_development" => "declared_development_dependency",
        "bundle_only" => "bundle_only_indexed_dependency",
        "transitive" => "indexed_transitive_gem_runtime_use_unproven",
      }.fetch(package["primary_role"], "indexed_gem_unknown_role")
    end

    def path_category(path)
      path.to_s.split(File::SEPARATOR).any? { |segment| %w[test tests spec specs feature features].include?(segment) } ? "test" : "source"
    end

    def aggregate_status(status_basis)
      status_basis.values.all? { |value| value == "complete" || value == true } ? "complete" : "partial"
    end

    def semantic_namespace_names(definition_backed_names, canonical_kinds, namespace_declarations)
      definition_backed_names.select do |name|
        SEMANTIC_NAMESPACE_KINDS.include?(canonical_kinds[name]) && namespace_declarations.key?(name)
      end.to_set
    end

    def sorted_count_hash(hash)
      hash.sort_by { |key, value| [-value.fetch("definitions"), key] }.to_h
    end

    def tally(records)
      records.each_with_object(Hash.new(0)) { |record, counts| counts[yield(record)] += 1 }
        .sort_by { |key, count| [-count, key.to_s] }.to_h
    end

    def tally_weighted(groups)
      groups.each_with_object(Hash.new(0)) do |group, counts|
        yield(group).each { |key, count| counts[key] += count }
      end.sort_by { |key, count| [-count, key] }.to_h
    end

    def write_json(payload)
      FileUtils.mkdir_p(File.dirname(@output_path))
      temporary = "#{@output_path}.tmp"
      File.write(temporary, "#{JSON.pretty_generate(payload)}\n")
      File.rename(temporary, @output_path)
    ensure
      FileUtils.rm_f(temporary) if temporary && File.exist?(temporary)
    end

    def timed(name)
      started = monotonic
      yield
    ensure
      @timings[name] = elapsed(started)
    end

    def monotonic
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def elapsed(started)
      monotonic - started
    end
  end
end
