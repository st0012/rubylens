# frozen_string_literal: true

module RubyLens
  class ArtModelBuilder
    SIGNAL_FIELDS = %w[ancestorDepth definitionSites reopenings descendants references members].freeze

    def initialize(seed: 0x51A7_E11A)
      @seed = seed
    end

    def build(snapshot)
      random = Random.new(@seed)
      namespaces = snapshot.fetch("namespaces").shuffle(random: random).map do |row|
        [random.rand(0..0xffff_ffff), *row]
      end
      package_order = (0...snapshot.fetch("packages").length).to_a.shuffle(random: random)
      package_index = package_order.each_with_index.to_h
      packages = package_order.map do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        [
          random.rand(0..0xffff_ffff),
          package.fetch("role"),
          package.fetch("location"),
          package.fetch("declarations").length,
          package.fetch("declarations").empty? ? 0 : 1,
        ]
      end
      dependencies = package_order.flat_map do |old_index|
        snapshot.fetch("packages").fetch(old_index).fetch("declarations").shuffle(random: random).map do |row|
          [random.rand(0..0xffff_ffff), package_index.fetch(old_index), *row]
        end
      end
      scope_counts = [0, 1, 2].map { |scope| namespaces.count { |row| row[3] == scope } }

      {
        "schema" => "rubylens.art.v1",
        "totals" => {
          "namespaces" => namespaces.length,
          "classes" => namespaces.count { |row| row[2].zero? },
          "modules" => namespaces.count { |row| row[2] == 1 },
          "scopes" => scope_counts,
          "packages" => packages.length,
          "dependencyDeclarations" => dependencies.length,
        },
        "domains" => signal_domains(namespaces, dependencies),
        "componentCounts" => snapshot.fetch("components"),
        "namespaces" => namespaces,
        "packages" => packages,
        "dependencyDeclarations" => dependencies,
        "warningCounts" => snapshot.fetch("warning_counts"),
      }
    end

    private

    def signal_domains(namespaces, dependencies)
      namespace_columns = [4, 5, 6, 7, 8, 9]
      dependency_columns = [3, 4, 5, 6, 7, 8]
      namespace_domains = namespace_columns.map { |column| maximum(namespaces, column) }
      dependency_domains = dependency_columns.map { |column| maximum(dependencies, column) }
      SIGNAL_FIELDS.each_with_index.to_h do |field, index|
        [field, [namespace_domains[index], dependency_domains[index]].max]
      end
    end

    def maximum(rows, column)
      rows.map { |row| row[column].to_i }.max || 0
    end
  end
end
