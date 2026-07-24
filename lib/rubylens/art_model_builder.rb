# frozen_string_literal: true

require_relative "dependency_warning"
require_relative "errors"
require_relative "morphology_classifier"

module RubyLens
  class ArtModelBuilder
    SCHEMA = "rubylens.art.v13"
    SIGNAL_FIELDS = %w[ancestorDepth definitionSites reopenings descendants references members].freeze
    # Namespace row columns carrying the six signals, aligned with SIGNAL_FIELDS.
    NAMESPACE_SIGNAL_COLUMNS = (3..8).freeze

    # `index` maps a snapshot ordinal to its shuffled position; `order` is the
    # inverse, listing snapshot ordinals in draw order.
    Namespaces = Data.define(:order, :index, :rows, :names, :reference_rows) do
      # Link endpoints past the namespace block address dependency stars, which
      # the snapshot numbers from zero after the namespaces.
      def referenced_dependency_ordinals
        reference_rows.map { |_referring_index, referenced_index| referenced_index - order.length }
      end
    end
    Packages = Data.define(:order, :index, :rows, :names, :morphologies, :systems)
    Dependencies = Data.define(:rows, :index)

    def initialize(seed: 0x51A7_E11A)
      @seed = seed
    end

    # Draw order is shuffled so neighbouring stars come from unrelated parts of
    # the codebase: adjacent points would otherwise share a package or a name
    # prefix and read as structure the galaxy does not mean to show. Every
    # ordinal the snapshot used is therefore remapped onto the shuffled order.
    def build(snapshot)
      random = Random.new(@seed)
      namespaces = build_namespaces(snapshot, random)
      packages = build_packages(snapshot, random)
      dependencies = build_dependencies(snapshot, packages, namespaces, random)

      {
        "schema" => SCHEMA,
        "projectName" => snapshot.fetch("project_name"),
        "morphology" => morphology_row(MorphologyClassifier.new(snapshot).call),
        "totals" => {
          "namespaces" => namespaces.rows.length,
          "packages" => packages.rows.length,
          "dependencyStars" => dependencies.rows.length,
        },
        "domains" => signal_domains(namespaces.rows, snapshot.fetch("dependency_signal_maxima")),
        "categoryStats" => snapshot.fetch("category_stats"),
        "namespaceNames" => namespaces.names,
        "namespaces" => namespaces.rows,
        "constantReferenceLinks" => build_constant_reference_links(
          namespaces.reference_rows,
          namespaces.index,
          dependencies.index,
        ),
        "packageNames" => packages.names,
        "packages" => packages.rows,
        "packageMorphologies" => packages.morphologies,
        "dependencySystems" => packages.systems,
        "dependencyStars" => dependencies.rows,
        "dependencyWarnings" => allowed_dependency_warnings(snapshot),
        "warningCounts" => snapshot.fetch("warning_counts"),
      }
    end

    private

    def build_namespaces(snapshot, random)
      rows = snapshot.fetch("namespaces")
      names = snapshot.fetch("namespace_names")
      order = (0...rows.length).to_a.shuffle(random: random)
      index = Array.new(order.length)
      order.each_with_index { |old_index, new_index| index[old_index] = new_index }

      Namespaces.new(
        order: order,
        index: index,
        rows: order.map { |old_index| [random.rand(0..0xffff_ffff), *rows.fetch(old_index)] },
        names: order.map { |old_index| names.fetch(old_index) },
        reference_rows: valid_constant_reference_rows(snapshot),
      )
    end

    def build_packages(snapshot, random)
      snapshot_packages = snapshot.fetch("packages")
      order = (0...snapshot_packages.length).to_a.shuffle(random: random)
      index = order.each_with_index.to_h
      systems, system_index = build_dependency_systems(snapshot, index)
      morphologies = []

      rows = order.map do |old_index|
        package = snapshot_packages.fetch(old_index)
        seed = random.rand(0..0xffff_ffff)
        morphologies << morphology_row(MorphologyClassifier.new(package: package, phase_seed: seed).call)
        [
          seed,
          package.fetch("role"),
          package.fetch("location"),
          package.fetch("declarations").length,
          *package.fetch("ruby_counts"),
          system_index.fetch(old_index, -1),
        ]
      end

      Packages.new(
        order: order,
        index: index,
        rows: rows,
        names: order.map { |old_index| snapshot_packages.fetch(old_index).fetch("name") },
        morphologies: morphologies,
        systems: systems,
      )
    end

    # Dependency stars are emitted package by package in shuffled order, so a
    # snapshot ordinal is only recoverable for the rows travel actually targets.
    # Those rows are identified before the shuffle and tracked by object
    # identity, since equal declaration rows are common and interchangeable.
    def build_dependencies(snapshot, packages, namespaces, random)
      targeted = travel_target_rows(snapshot, namespaces.referenced_dependency_ordinals)
      rows = []
      index = {}
      packages.order.each do |old_index|
        package = snapshot.fetch("packages").fetch(old_index)
        package.fetch("declarations").sort.shuffle(random: random).each do |declaration|
          original_ordinal = targeted[declaration]
          index[original_ordinal] = rows.length if original_ordinal
          rows << [random.rand(0..0xffff_ffff), packages.index.fetch(old_index), *declaration.drop(1)]
        end
      end
      Dependencies.new(rows: rows, index: index)
    end

    def travel_target_rows(snapshot, dependency_ordinals)
      offsets = []
      total = 0
      snapshot.fetch("packages").each do |package|
        offsets << total
        total += package.fetch("declarations").length
      end

      targeted = {}.compare_by_identity
      dependency_ordinals.each do |ordinal|
        next if ordinal.negative? || ordinal >= total

        next_package = offsets.bsearch_index { |offset| offset > ordinal }
        package_index = (next_package || offsets.length) - 1
        declarations = snapshot.fetch("packages").fetch(package_index).fetch("declarations")
        targeted[declarations.fetch(ordinal - offsets.fetch(package_index))] = ordinal
      end
      targeted
    end

    def morphology_row(morphology)
      [morphology.fetch("family"), *morphology.fetch("knobs")]
    end

    # Warnings reach the artifact only if they match the closed vocabulary, so a
    # tampered snapshot cannot smuggle arbitrary text into a shareable page.
    def allowed_dependency_warnings(snapshot)
      snapshot.fetch("dependency_warnings", []).filter_map do |warning|
        name = warning.fetch("name")
        reason = warning.fetch("reason")
        next unless name.is_a?(String) && DependencyWarning::NAME_PATTERN.match?(name)
        next unless reason.is_a?(String) && DependencyWarning::ALLOWED_REASONS.include?(reason)

        { "name" => name, "reason" => reason }
      end
    end

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

    # Each signal is scaled against the larger of its workspace and dependency
    # maxima, so the two populations stay comparable in the same scene.
    def signal_domains(namespace_rows, dependency_maxima)
      namespace_domains = NAMESPACE_SIGNAL_COLUMNS.map do |column|
        namespace_rows.map { |row| row[column].to_i }.max || 0
      end
      SIGNAL_FIELDS.each_with_index.to_h do |field, index|
        [field, [namespace_domains[index], dependency_maxima[index]].max]
      end
    end
  end
end
