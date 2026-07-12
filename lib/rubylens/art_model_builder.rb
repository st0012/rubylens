# frozen_string_literal: true

require "digest"
require_relative "model/dependency_aggregation"
require_relative "model/group_layout"
require_relative "model/namespace_allocation"

module RubyLens
  class ArtModelBuilder
    SIGNAL_FIELDS = %w[ancestorDepth definitionSites reopenings descendants references members].freeze

    def initialize(seed: 0x51A7_E11A, namespace_budget: nil)
      @seed = seed
      @namespace_budget = namespace_budget
    end

    def build(snapshot)
      return build_configured(snapshot) if snapshot["schema"] == "rubylens.snapshot.v6"

      random = Random.new(@seed)
      namespace_order = (0...snapshot.fetch("namespaces").length).to_a.shuffle(random: random)
      namespaces = namespace_order.map do |index|
        row = snapshot.fetch("namespaces").fetch(index)
        [random.rand(0..0xffff_ffff), *row]
      end
      namespace_names = namespace_order.map { |index| snapshot.fetch("namespace_names").fetch(index) }
      package_order = (0...snapshot.fetch("packages").length).to_a.shuffle(random: random)
      package_index = package_order.each_with_index.to_h
      packages = package_order.map do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        declaration_count = package.fetch("declaration_count") { package.fetch("declarations").length }
        [
          random.rand(0..0xffff_ffff),
          package.fetch("role"),
          package.fetch("location"),
          declaration_count,
          *package.fetch("ruby_counts"),
        ]
      end
      package_names = package_order.map { |old_index| snapshot.fetch("packages").fetch(old_index).fetch("name") }
      indexed_dependency_count = snapshot.fetch("packages").sum do |package|
        package.fetch("declaration_count") { package.fetch("declarations").length }
      end
      render_target = [18_000, indexed_dependency_count].min
      dependencies = []
      package_order.each do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        declarations = package.fetch("declarations").shuffle(random: random)
        quota = if package.key?("declaration_count")
          declarations.length
        elsif declarations.empty?
          0
        else
          [declarations.length, [1, declarations.length * render_target / [indexed_dependency_count, 1].max].max].min
        end
        declarations.first(quota).each do |declaration|
          dependencies << [
            random.rand(0..0xffff_ffff),
            package_index.fetch(old_index),
            *declaration.drop(1),
          ]
        end
      end
      {
        "schema" => "rubylens.art.v7",
        "projectName" => snapshot.fetch("project_name"),
        "totals" => {
          "namespaces" => namespaces.length,
          "packages" => packages.length,
          "dependencyStars" => indexed_dependency_count,
          "renderedDependencyStars" => dependencies.length,
        },
        "domains" => signal_domains(namespaces, dependencies, snapshot["dependency_signal_maxima"]),
        "componentCounts" => snapshot.fetch("components"),
        "categoryStats" => snapshot.fetch("category_stats"),
        "namespaceNames" => namespace_names,
        "namespaces" => namespaces,
        "packageNames" => package_names,
        "packages" => packages,
        "dependencyStars" => dependencies,
        "warningCounts" => snapshot.fetch("warning_counts"),
      }
    end

    private

    def build_configured(snapshot)
      source_groups = snapshot.fetch("groups")
      sizes = source_groups.map { |group| group.fetch("namespace_counts").sum }
      core_namespace_counts = source_groups.map do |group|
        core, _tests, mixed = group.fetch("namespace_counts")
        core + mixed
      end
      seeds = source_groups.map { |group| group.fetch("anchor_seed") }
      budget = @namespace_budget.nil? ? sizes.sum : Integer(@namespace_budget)
      category_minimums = Array.new(source_groups.length, 0)
      snapshot.fetch("namespaces").each do |row|
        group_index = row.fetch(0)
        category_minimums[group_index] |= row.fetch(2) == 1 ? 2 : 1
      end
      category_minimums.map! { |mask| (mask & 1) + ((mask >> 1) & 1) }
      quotas = Model::NamespaceAllocation.new(
        sizes:, keys: source_groups.map { |group| group.fetch("id") }, budget:, minimums: category_minimums,
      ).quotas
      candidates = Array.new(source_groups.length) { [] }
      snapshot.fetch("namespaces").each_with_index do |row, index|
        name = snapshot.fetch("namespace_names").fetch(index)
        rank = stable_namespace_rank(name)
        candidates.fetch(row.fetch(0)) << [rank, name, row]
      end

      namespaces = []
      namespace_names = []
      group_ranges = []
      group_lods = []
      source_groups.each_index do |group_index|
        selected = select_candidates(candidates.fetch(group_index), quotas.fetch(group_index))
        first = namespaces.length
        selected.each_with_index do |(_rank, name, row), selected_index|
          namespaces << [visual_namespace_seed(group_index, selected_index), *row]
          namespace_names << name
        end
        group_ranges << [first, selected.length]
        category_minimum = [
          selected.any? { |_rank, _name, row| row.fetch(2) != 1 },
          selected.any? { |_rank, _name, row| row.fetch(2) == 1 },
        ].count(true)
        mid_length = [selected.length, [category_minimum, Math.sqrt(selected.length).ceil].max].min
        group_lods << [mid_length, selected.length]
      end

      groups = source_groups.each_with_index.map do |group, index|
        core, tests = group.fetch("ruby_counts").values_at("core", "tests")
        namespace_core, namespace_tests, namespace_mixed = group.fetch("namespace_counts")
        [
          index,
          namespace_core, namespace_tests, namespace_mixed, group.fetch("cross_group_namespaces"),
          *core, *tests,
        ]
      end
      association_layout = Model::GroupLayout.new(seeds:, core_namespace_counts:, total_namespace_counts: sizes)
      group_anchors = association_layout.anchors
      group_radii = association_layout.radii.map { |radius| (radius * 1000).round }
      explorer_layout = snapshot.fetch("explorer_layout", "association")
      explorer_anchors = if explorer_layout == "atlas"
        Model::GroupLayout.new(seeds:, core_namespace_counts:, total_namespace_counts: sizes, mode: :atlas).anchors
      end
      package_model = build_configured_packages(snapshot)
      {
        "schema" => "rubylens.art.v8",
        "projectName" => snapshot.fetch("project_name"),
        "totals" => {
          "namespaces" => snapshot.fetch("namespaces").length,
          "renderedNamespaces" => namespaces.length,
          "groups" => groups.length,
          "packages" => package_model.fetch(:packages).length,
          "dependencyStars" => package_model.fetch(:indexed_dependency_count),
          "renderedDependencyStars" => package_model.fetch(:dependencies).length,
        },
        "domains" => configured_signal_domains(snapshot),
        "categoryStats" => snapshot.fetch("category_stats"),
        "groupNames" => source_groups.map { |group| group.fetch("name") },
        "groups" => groups,
        "groupRanges" => group_ranges,
        "groupLods" => group_lods,
        "groupAnchors" => group_anchors,
        "groupRadii" => group_radii,
        "explorerLayout" => explorer_layout,
        "explorerAnchors" => explorer_anchors,
        "namespaceNames" => namespace_names,
        "namespaces" => namespaces,
        "packageNames" => package_model.fetch(:package_names),
        "packages" => package_model.fetch(:packages),
        "dependencyStars" => package_model.fetch(:dependencies),
        "warningCounts" => snapshot.fetch("warning_counts"),
      }
    end

    def build_configured_packages(snapshot)
      sampled_dependency_count = snapshot.fetch("packages").sum { |package| package.fetch("declarations").length }
      if sampled_dependency_count > Model::DependencyAggregation::DEFAULT_ROW_LIMIT
        raise Error, "configured dependency rows exceed the bounded snapshot contract"
      end

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
      dependencies = []
      package_order.each do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        package.fetch("declarations").shuffle(random: random).each do |declaration|
          dependencies << [random.rand(0..0xffff_ffff), package_index.fetch(old_index), *declaration.drop(1)]
        end
      end
      { packages:, package_names:, indexed_dependency_count:, dependencies: }
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

    def visual_namespace_seed(group_index, selected_index)
      Digest::SHA256.digest("rubylens.visual\0#{@seed}\0#{group_index}\0#{selected_index}").unpack1("N")
    end

    def configured_signal_domains(snapshot)
      namespace_maxima = (3..8).map { |column| maximum(snapshot.fetch("namespaces"), column) }
      dependency_maxima = snapshot.fetch("dependency_signal_maxima")
      SIGNAL_FIELDS.each_with_index.to_h do |field, index|
        [field, [namespace_maxima.fetch(index), dependency_maxima.fetch(index)].max]
      end
    end

    def signal_domains(namespaces, dependencies, dependency_maxima = nil)
      namespace_columns = [4, 5, 6, 7, 8, 9]
      dependency_columns = [2, 3, 4, 5, 6, 7]
      namespace_domains = namespace_columns.map { |column| maximum(namespaces, column) }
      dependency_domains = dependency_maxima || dependency_columns.map { |column| maximum(dependencies, column) }
      SIGNAL_FIELDS.each_with_index.to_h do |field, index|
        [field, [namespace_domains[index], dependency_domains[index]].max]
      end
    end

    def maximum(rows, column)
      rows.map { |row| row[column].to_i }.max || 0
    end

  end
end
