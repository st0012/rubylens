# frozen_string_literal: true

require_relative "dependency_warning"
require_relative "errors"
require_relative "morphology_classifier"

module RubyLens
  class ArtModelBuilder
    SIGNAL_FIELDS = %w[ancestorDepth definitionSites reopenings descendants references members].freeze

    def initialize(seed: 0x51A7_E11A)
      @seed = seed
    end

    def build(snapshot)
      random = Random.new(@seed)
      morphology = MorphologyClassifier.new(snapshot).call
      namespace_order = (0...snapshot.fetch("namespaces").length).to_a.shuffle(random: random)
      namespace_index = Array.new(namespace_order.length)
      namespace_order.each_with_index { |old_index, new_index| namespace_index[old_index] = new_index }
      constant_reference_rows = valid_constant_reference_rows(snapshot)
      namespaces = namespace_order.map do |index|
        row = snapshot.fetch("namespaces").fetch(index)
        [random.rand(0..0xffff_ffff), *row]
      end
      namespace_names = namespace_order.map { |index| snapshot.fetch("namespace_names").fetch(index) }
      package_order = (0...snapshot.fetch("packages").length).to_a.shuffle(random: random)
      package_index = package_order.each_with_index.to_h
      dependency_systems, dependency_system_index = build_dependency_systems(snapshot, package_index)
      package_morphologies = []
      packages = package_order.map do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        package_seed = random.rand(0..0xffff_ffff)
        package_morphology = MorphologyClassifier.new(package:, phase_seed: package_seed).call
        package_morphologies << [package_morphology.fetch("family"), *package_morphology.fetch("knobs")]
        [
          package_seed,
          package.fetch("role"),
          package.fetch("location"),
          package.fetch("declarations").length,
          *package.fetch("ruby_counts"),
          dependency_system_index.fetch(old_index, -1),
        ]
      end
      package_names = package_order.map { |old_index| snapshot.fetch("packages").fetch(old_index).fetch("name") }
      dependency_offsets = []
      dependency_count = 0
      snapshot.fetch("packages").each do |package|
        dependency_offsets << dependency_count
        dependency_count += package.fetch("declarations").length
      end
      dependency_target_rows = {}.compare_by_identity
      constant_reference_rows.each do |_referring_index, referenced_index|
        dependency_ordinal = referenced_index - namespace_order.length
        next if dependency_ordinal.negative? || dependency_ordinal >= dependency_count

        next_package_index = dependency_offsets.bsearch_index { |offset| offset > dependency_ordinal }
        old_package_index = (next_package_index || dependency_offsets.length) - 1
        package = snapshot.fetch("packages").fetch(old_package_index)
        local_index = dependency_ordinal - dependency_offsets.fetch(old_package_index)
        dependency_target_rows[package.fetch("declarations").fetch(local_index)] = dependency_ordinal
      end
      dependencies = []
      dependency_index = {}
      package_order.each do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        declarations = package.fetch("declarations").sort.shuffle(random: random)
        declarations.each do |declaration|
          original_ordinal = dependency_target_rows[declaration]
          dependency_index[original_ordinal] = dependencies.length if original_ordinal
          dependencies << [
            random.rand(0..0xffff_ffff),
            package_index.fetch(old_index),
            *declaration.drop(1),
          ]
        end
      end
      constant_reference_links = build_constant_reference_links(
        constant_reference_rows,
        namespace_index,
        dependency_index,
      )
      {
        "schema" => "rubylens.art.v13",
        "projectName" => snapshot.fetch("project_name"),
        "morphology" => [morphology.fetch("family"), *morphology.fetch("knobs")],
        "totals" => {
          "namespaces" => namespaces.length,
          "packages" => packages.length,
          "dependencyStars" => dependencies.length,
        },
        "domains" => signal_domains(namespaces, snapshot.fetch("dependency_signal_maxima")),
        "categoryStats" => snapshot.fetch("category_stats"),
        "namespaceNames" => namespace_names,
        "namespaces" => namespaces,
        "constantReferenceLinks" => constant_reference_links,
        "packageNames" => package_names,
        "packages" => packages,
        "packageMorphologies" => package_morphologies,
        "dependencySystems" => dependency_systems,
        "dependencyStars" => dependencies,
        "dependencyWarnings" => snapshot.fetch("dependency_warnings", []).filter_map do |warning|
          name = warning.fetch("name")
          reason = warning.fetch("reason")
          next unless name.is_a?(String) && DependencyWarning::NAME_PATTERN.match?(name)
          next unless reason.is_a?(String) && DependencyWarning::ALLOWED_REASONS.include?(reason)

          { "name" => name, "reason" => reason }
        end,
        "warningCounts" => snapshot.fetch("warning_counts"),
      }
    end

    private

    def valid_constant_reference_rows(snapshot)
      rows = snapshot.fetch("constant_reference_links", [])
      return [] unless rows.is_a?(Array)

      rows.select do |row|
        row.is_a?(Array) && row.length == 2 && row.all?(Integer) && row.none?(&:negative?)
      end
    end

    def build_constant_reference_links(rows, namespace_index, dependency_index)
      snapshot_namespace_count = namespace_index.length
      candidates = rows.filter_map do |row|
        referring_index, referenced_index = row
        remapped_referring_index = namespace_index[referring_index]
        remapped_referenced_index = if referenced_index < snapshot_namespace_count
          namespace_index[referenced_index]
        else
          dependency = dependency_index[referenced_index - snapshot_namespace_count]
          snapshot_namespace_count + dependency if dependency
        end
        next if remapped_referring_index.nil? || remapped_referenced_index.nil?

        [remapped_referring_index, remapped_referenced_index]
      end

      candidates.shuffle(random: Random.new(@seed ^ 0xC057_A17E))
    end

    def build_dependency_systems(snapshot, package_index)
      system_random = Random.new(@seed ^ 0xD3E5_157E)
      package_system_index = {}
      systems = snapshot.fetch("dependency_systems", []).sort_by { |system| system.fetch("id") }
        .each_with_index.map do |system, system_index|
          old_package_indexes = system.fetch("package_indexes")
          old_package_indexes.each { |old_index| package_system_index[old_index] = system_index }
          [
            system_random.rand(0..0xffff_ffff),
            package_index.fetch(system.fetch("label_package_index")),
          ]
        end
      [systems, package_system_index]
    end

    def signal_domains(namespaces, dependency_maxima)
      namespace_columns = [3, 4, 5, 6, 7, 8]
      namespace_domains = namespace_columns.map { |column| maximum(namespaces, column) }
      SIGNAL_FIELDS.each_with_index.to_h do |field, index|
        [field, [namespace_domains[index], dependency_maxima[index]].max]
      end
    end

    def maximum(rows, column)
      rows.map { |row| row[column].to_i }.max || 0
    end

  end
end
