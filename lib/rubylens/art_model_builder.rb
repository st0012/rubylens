# frozen_string_literal: true

require_relative "dependency_warning"
require_relative "morphology_classifier"

module RubyLens
  class ArtModelBuilder
    SIGNAL_FIELDS = %w[ancestorDepth definitionSites reopenings descendants references members].freeze

    def initialize(seed: 0x51A7_E11A)
      @seed = seed
    end

    def build(snapshot)
      random = Random.new(@seed)
      morphology = MorphologyClassifier.new.call(snapshot)
      namespace_order = (0...snapshot.fetch("namespaces").length).to_a.shuffle(random: random)
      namespaces = namespace_order.map do |index|
        row = snapshot.fetch("namespaces").fetch(index)
        [random.rand(0..0xffff_ffff), *row]
      end
      namespace_names = namespace_order.map { |index| snapshot.fetch("namespace_names").fetch(index) }
      package_order = (0...snapshot.fetch("packages").length).to_a.shuffle(random: random)
      package_index = package_order.each_with_index.to_h
      dependency_systems, dependency_system_index = build_dependency_systems(snapshot, package_index)
      packages = package_order.map do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        declaration_count = package.fetch("declaration_count") { package.fetch("declarations").length }
        [
          random.rand(0..0xffff_ffff),
          package.fetch("role"),
          package.fetch("location"),
          declaration_count,
          *package.fetch("ruby_counts"),
          dependency_system_index.fetch(old_index, -1),
        ]
      end
      package_names = package_order.map { |old_index| snapshot.fetch("packages").fetch(old_index).fetch("name") }
      indexed_dependency_count = snapshot.fetch("packages").sum do |package|
        package.fetch("declaration_count") { package.fetch("declarations").length }
      end
      dependencies = []
      package_order.each do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        declarations = package.fetch("declarations").sort.shuffle(random: random)
        declarations.each do |declaration|
          dependencies << [
            random.rand(0..0xffff_ffff),
            package_index.fetch(old_index),
            *declaration.drop(1),
          ]
        end
      end
      {
        "schema" => "rubylens.art.v9",
        "projectName" => snapshot.fetch("project_name"),
        "morphology" => morphology,
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
