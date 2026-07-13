# frozen_string_literal: true

require "digest"
require_relative "model/dependency_aggregation"
require_relative "model/namespace_allocation"
require_relative "model/workspace_layout"

module RubyLens
  class ArtModelBuilder
    SIGNAL_FIELDS = %w[ancestorDepth definitionSites reopenings descendants references members].freeze
    MID_LOD_SQRT_MULTIPLIER = 3
    DEPENDENCY_ROW_LIMIT = Model::DependencyAggregation::DEFAULT_ROW_LIMIT
    GEOMETRY_SCALE = 1_000
    ANGLE_SCALE = 1_000_000

    def initialize(seed: 0x51A7_E11A, namespace_budget: nil)
      @seed = seed
      @namespace_budget = namespace_budget
    end

    def build(snapshot)
      configured = snapshot["schema"] == "rubylens.snapshot.v6"
      source_regions = build_source_regions(snapshot, configured:)
      sizes = source_regions.map { |region| region.fetch(:namespace_counts).sum }
      keys = source_regions.map { |region| region.fetch(:key) }
      seeds = source_regions.map { |region| region.fetch(:seed) }
      exact_namespace_count = snapshot.fetch("namespaces").length
      unless sizes.sum == exact_namespace_count
        raise Error, "workspace region namespace totals do not reconcile"
      end

      budget = @namespace_budget.nil? ? exact_namespace_count : Integer(@namespace_budget)
      quotas = Model::NamespaceAllocation.new(
        sizes:, keys:, budget:, minimums: category_minimums(snapshot, source_regions.length, configured:),
      ).quotas
      candidates = namespace_candidates(snapshot, source_regions.length, configured:)
      namespaces, namespace_names, region_ranges, region_lods = build_namespaces(
        candidates:, quotas:, source_regions:,
      )

      radius_population = radius_population(source_regions)
      layout = Model::WorkspaceLayout.new(
        seeds:, namespace_counts: sizes, radius_population:,
      )
      package_model = build_packages(snapshot)
      rendered_core = namespaces.count { |row| row.fetch(3) != 1 }
      rendered_tests = namespaces.length - rendered_core
      exact_core = source_regions.sum { |region| region.fetch(:namespace_counts).values_at(0, 2).sum }
      exact_tests = source_regions.sum { |region| region.fetch(:namespace_counts).fetch(1) }
      model = {
        "schema" => "rubylens.art.v9",
        "projectName" => snapshot.fetch("project_name"),
        "totals" => {
          "namespaces" => exact_namespace_count,
          "renderedNamespaces" => namespaces.length,
          "regions" => source_regions.length,
          "packages" => package_model.fetch(:packages).length,
          "dependencyStars" => package_model.fetch(:indexed_dependency_count),
          "renderedDependencyStars" => package_model.fetch(:dependencies).length,
        },
        "domains" => signal_domains(snapshot),
        "categoryStats" => snapshot.fetch("category_stats"),
        "workspaceRadius" => scale_geometry(layout.radius),
        "workspaceDensity" => [
          radius_population, exact_core, exact_tests, rendered_core, rendered_tests,
          namespaces.map(&:last).max || 0,
        ],
        "regions" => source_regions.each_with_index.map { |region, index| region_row(region, index) },
        "regionRanges" => region_ranges,
        "regionLods" => region_lods,
        "regionBounds" => layout.bounds.map do |start_angle, end_angle, inner_radius, outer_radius|
          [scale_angle(start_angle), scale_angle(end_angle), scale_geometry(inner_radius), scale_geometry(outer_radius)]
        end,
        "regionCentroids" => layout.centroids.map { |centroid| centroid.map { |value| scale_geometry(value) } },
        "namespaceNames" => namespace_names,
        "namespaces" => namespaces,
        "packageNames" => package_model.fetch(:package_names),
        "packages" => package_model.fetch(:packages),
        "dependencyStars" => package_model.fetch(:dependencies),
        "warningCounts" => snapshot.fetch("warning_counts"),
      }
      model["regionNames"] = source_regions.map { |region| region.fetch(:name) } if configured
      if (reference = snapshot["framework_reference"])
        model["frameworkReference"] = build_framework_reference(reference, package_model.fetch(:package_index))
      end
      model
    end

    private

    def build_source_regions(snapshot, configured:)
      if configured
        snapshot.fetch("groups").map do |group|
          {
            key: group.fetch("id"),
            name: group.fetch("name"),
            seed: group.fetch("anchor_seed"),
            namespace_counts: group.fetch("namespace_counts"),
            ruby_counts: group.fetch("ruby_counts"),
            cross_group_namespaces: group.fetch("cross_group_namespaces"),
          }
        end
      else
        namespace_counts = Array.new(3, 0)
        snapshot.fetch("namespaces").each do |row|
          scope = row.fetch(2)
          namespace_counts[scope] += 1
        end
        [{
          key: "workspace",
          seed: stable_region_seed(0),
          namespace_counts:,
          ruby_counts: { "core" => Array.new(4, 0), "tests" => Array.new(4, 0) },
          cross_group_namespaces: 0,
        }]
      end
    end

    def category_minimums(snapshot, region_count, configured:)
      masks = Array.new(region_count, 0)
      snapshot.fetch("namespaces").each do |row|
        region_index = configured ? row.fetch(0) : 0
        masks[region_index] |= row.fetch(2) == 1 ? 2 : 1
      end
      masks.map { |mask| (mask & 1) + ((mask >> 1) & 1) }
    end

    def namespace_candidates(snapshot, region_count, configured:)
      candidates = Array.new(region_count) { [] }
      snapshot.fetch("namespaces").each_with_index do |row, index|
        name = snapshot.fetch("namespace_names").fetch(index)
        visual_row = configured ? row : row.dup.tap { |copy| copy[0] = 0 }
        candidates.fetch(visual_row.fetch(0)) << [stable_namespace_rank(name), name, visual_row]
      end
      candidates
    end

    def build_namespaces(candidates:, quotas:, source_regions:)
      namespaces = []
      names = []
      ranges = []
      lods = []
      source_regions.each_index do |region_index|
        selected = select_candidates(candidates.fetch(region_index), quotas.fetch(region_index))
        first = namespaces.length
        category_weights = represented_category_weights(selected, source_regions.fetch(region_index).fetch(:namespace_counts))
        category_offsets = Hash.new(0)
        selected.each_with_index do |(_rank, name, row), selected_index|
          category = row.fetch(2) == 1 ? :tests : :core
          weight = category_weights.fetch(category).fetch(category_offsets[category], 0)
          category_offsets[category] += 1
          namespaces << [visual_namespace_seed(region_index, selected_index), *row, weight]
          names << name
        end
        ranges << [first, selected.length]
        category_minimum = [
          selected.any? { |_rank, _name, row| row.fetch(2) != 1 },
          selected.any? { |_rank, _name, row| row.fetch(2) == 1 },
        ].count(true)
        scaled_mid_length = (Math.sqrt(selected.length) * MID_LOD_SQRT_MULTIPLIER).ceil
        mid_length = [selected.length, [category_minimum, scaled_mid_length].max].min
        lods << [mid_length, selected.length]
      end
      [namespaces, names, ranges, lods]
    end

    def represented_category_weights(selected, namespace_counts)
      core, tests, mixed = namespace_counts
      {
        core: represented_weights(core + mixed, selected.count { |_rank, _name, row| row.fetch(2) != 1 }),
        tests: represented_weights(tests, selected.count { |_rank, _name, row| row.fetch(2) == 1 }),
      }
    end

    def represented_weights(total, count)
      return [] if count.zero?

      quotient, remainder = total.divmod(count)
      Array.new(count) { |index| quotient + (index < remainder ? 1 : 0) }
    end

    def region_row(region, index)
      namespace_core, namespace_tests, namespace_mixed = region.fetch(:namespace_counts)
      core, tests = region.fetch(:ruby_counts).values_at("core", "tests")
      [
        index,
        namespace_core, namespace_tests, namespace_mixed, region.fetch(:cross_group_namespaces),
        *core, *tests,
      ]
    end

    def radius_population(source_regions)
      core = source_regions.sum { |region| region.fetch(:namespace_counts).values_at(0, 2).sum }
      return core if core.positive?

      source_regions.sum { |region| region.fetch(:namespace_counts).fetch(1) }
    end

    def build_packages(snapshot)
      random = Random.new(@seed)
      package_order = (0...snapshot.fetch("packages").length).to_a.shuffle(random: random)
      package_index = package_order.each_with_index.to_h
      packages = package_order.map do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        declaration_count = package.fetch("declaration_count") { package.fetch("declarations").length }
        [random.rand(0..0xffff_ffff), package.fetch("role"), package.fetch("location"), declaration_count, *package.fetch("ruby_counts")]
      end
      package_names = package_order.map { |old_index| snapshot.fetch("packages").fetch(old_index).fetch("name") }
      indexed_dependency_count = snapshot.fetch("packages").sum do |package|
        package.fetch("declaration_count") { package.fetch("declarations").length }
      end
      sampled_dependency_count = snapshot.fetch("packages").sum { |package| package.fetch("declarations").length }
      render_target = [DEPENDENCY_ROW_LIMIT, sampled_dependency_count].min
      dependencies = []
      package_order.each do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        declarations = package.fetch("declarations").shuffle(random: random)
        quota = if sampled_dependency_count <= render_target
          declarations.length
        elsif declarations.empty?
          0
        else
          [declarations.length, [1, declarations.length * render_target / sampled_dependency_count].max].min
        end
        declarations.first(quota).each do |declaration|
          dependencies << [random.rand(0..0xffff_ffff), package_index.fetch(old_index), *declaration.drop(1)]
        end
      end
      {
        packages:, package_names:, package_index:, indexed_dependency_count:,
        dependencies: dependencies.first(DEPENDENCY_ROW_LIMIT),
      }
    end

    def build_framework_reference(reference, package_index)
      namespace_count = reference.fetch("ruby_counts").first(2).sum
      system_radius = if reference.fetch("comparable")
        scale_geometry(Model::WorkspaceLayout.radius(namespace_count))
      else
        0
      end
      {
        "kind" => reference.fetch("kind"),
        "version" => reference.fetch("version"),
        "scope" => reference.fetch("scope"),
        "members" => reference.fetch("members"),
        "availableMembers" => reference.fetch("available_members"),
        "coverage" => reference.fetch("coverage"),
        "status" => reference.fetch("status"),
        "comparable" => reference.fetch("comparable"),
        "rubyCounts" => reference.fetch("ruby_counts"),
        "systemRadius" => system_radius,
        "packageIndex" => reference["package_index"] && package_index.fetch(reference.fetch("package_index")),
      }
    end

    def select_candidates(candidates, quota)
      ranked = candidates.sort_by { |rank, name, _row| [rank, name] }
      return [] if quota.zero?

      selected = []
      core = ranked.find { |_rank, _name, row| row.fetch(2) != 1 }
      tests = ranked.find { |_rank, _name, row| row.fetch(2) == 1 }
      selected << core if core
      selected << tests if tests && selected.length < quota
      ranked.each do |candidate|
        break if selected.length >= quota
        selected << candidate unless candidate.equal?(core) || candidate.equal?(tests)
      end
      selected.first(quota)
    end

    def stable_namespace_rank(name)
      Digest::SHA256.digest("rubylens.namespace\0#{@seed}\0#{name}").unpack1("N")
    end

    def stable_region_seed(index)
      Digest::SHA256.digest("rubylens.region\0#{@seed}\0#{index}").unpack1("N")
    end

    def visual_namespace_seed(region_index, selected_index)
      Digest::SHA256.digest("rubylens.visual\0#{@seed}\0#{region_index}\0#{selected_index}").unpack1("N")
    end

    def signal_domains(snapshot)
      namespace_maxima = (3..8).map { |column| maximum(snapshot.fetch("namespaces"), column) }
      dependency_maxima = snapshot["dependency_signal_maxima"] || (0...SIGNAL_FIELDS.length).map do |index|
        maximum(snapshot.fetch("packages").flat_map { |package| package.fetch("declarations") }, index + 1)
      end
      SIGNAL_FIELDS.each_with_index.to_h do |field, index|
        [field, [namespace_maxima.fetch(index), dependency_maxima.fetch(index)].max]
      end
    end

    def maximum(rows, column)
      rows.map { |row| row[column].to_i }.max || 0
    end

    def scale_geometry(value)
      (value * GEOMETRY_SCALE).round
    end

    def scale_angle(value)
      (value * ANGLE_SCALE).round
    end
  end
end
