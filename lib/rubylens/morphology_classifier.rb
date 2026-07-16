# frozen_string_literal: true

require "digest"

module RubyLens
  class MorphologyClassifier
    ELLIPTICAL = 0
    LENTICULAR = 1
    SPIRAL = 2
    BARRED_SPIRAL = 3
    IRREGULAR = 4

    IRREGULAR_SIZE_LIMIT = 30
    ELLIPTICAL_MAX = 0.18
    LENTICULAR_MAX = 0.30
    BAR_CONCENTRATION = 0.50
    SPIRAL_STAGE_WIDTH = 0.10
    SPIRAL_KNOB_RANGE = 0.35

    DEFAULT_KNOBS = [0, 240, 3, 105, 380, 0, 0, 0, 0].freeze

    def call(snapshot)
      inputs = inputs_for(snapshot)
      return fallback unless inputs

      classify(**inputs)
    rescue KeyError, TypeError, ArgumentError
      fallback
    end

    private

    def inputs_for(snapshot)
      return unless snapshot.is_a?(Hash)

      rows = snapshot.fetch("namespaces")
      names = snapshot.fetch("namespace_names")
      packages = snapshot.fetch("packages")
      project_name = snapshot.fetch("project_name")
      return unless rows.is_a?(Array) && names.is_a?(Array) && rows.length == names.length
      return unless packages.is_a?(Array) && project_name.is_a?(String)
      return if rows.empty?
      return unless rows.each_with_index.all? { |row, index| valid_namespace?(row, names[index]) }

      core_indexes = rows.each_index.reject { |index| rows[index][2] == 1 }
      core_count = core_indexes.length
      test_count = rows.length - core_count
      module_count = core_indexes.count { |index| rows[index][1] == 1 }
      dependency_count = packages.sum { |package| dependency_declaration_count(package) }

      {
        project_name:,
        size: rows.length,
        module_fraction: ratio(module_count, core_count),
        test_share: ratio(test_count, rows.length),
        dependency_share: ratio(dependency_count, dependency_count + core_count),
        root_concentration: root_concentration(names, core_indexes, core_count),
      }
    end

    def valid_namespace?(row, name)
      row.is_a?(Array) && row.length >= 3 &&
        [0, 1].include?(row[1]) && [0, 1, 2].include?(row[2]) &&
        name.is_a?(String) && !name.empty?
    end

    def dependency_declaration_count(package)
      raise TypeError unless package.is_a?(Hash)

      count = package.fetch("declaration_count")
      raise TypeError unless count.is_a?(Integer) && count >= 0

      count
    end

    def ratio(numerator, denominator)
      denominator.zero? ? 0.0 : numerator.fdiv(denominator)
    end

    def root_concentration(names, core_indexes, core_count)
      return 0.0 if core_count.zero?

      counts = core_indexes.map { |index| names[index].split("::", 2).first }.tally
      counts.sum { |_root, count| ratio(count, core_count)**2 }
    end

    def classify(project_name:, size:, module_fraction:, test_share:, dependency_share:, root_concentration:)
      phase_seed = Digest::SHA256.digest(project_name).unpack1("N")
      if size < IRREGULAR_SIZE_LIMIT
        return morphology(
          IRREGULAR,
          "Irr",
          clump_count: 2 + [[(size - 1) / 7, 0].max, 3].min,
          clump_spread: scaled(0.50 + 0.30 * ((module_fraction + test_share) / 2)),
          phase_seed:,
        )
      end

      structure = 0.45 * test_share + 0.30 * module_fraction + 0.25 * dependency_share
      if structure < ELLIPTICAL_MAX
        ellipticity = [0.9 * module_fraction, 0.7].min
        return morphology(
          ELLIPTICAL,
          "E#{(ellipticity * 10).round}",
          ellipticity: scaled(ellipticity),
          phase_seed:,
        )
      end

      if structure < LENTICULAR_MAX
        progress = (structure - ELLIPTICAL_MAX) / (LENTICULAR_MAX - ELLIPTICAL_MAX)
        return morphology(
          LENTICULAR,
          "S0",
          bulge_share: scaled(0.42 - 0.08 * progress),
          phase_seed:,
        )
      end

      family = root_concentration >= BAR_CONCENTRATION ? BARRED_SPIRAL : SPIRAL
      stage = [[((structure - LENTICULAR_MAX) / SPIRAL_STAGE_WIDTH).floor, 0].max, 2].min
      designation = family == BARRED_SPIRAL ? "SB#{%w[a b c][stage]}" : "S#{%w[a b c][stage]}"
      progress = [[(structure - LENTICULAR_MAX) / SPIRAL_KNOB_RANGE, 0.0].max, 1.0].min
      arm_limit = family == BARRED_SPIRAL ? 2 : 4
      morphology(
        family,
        designation,
        bulge_share: scaled(0.36 - 0.22 * progress),
        arm_count: 2 + (progress * arm_limit).round,
        winding: scaled(0.18 - 0.115 * progress),
        arm_fraction: scaled(0.45 + 0.11 * progress),
        bar_length: family == BARRED_SPIRAL ? scaled(0.28 + 0.22 * progress) : 0,
        phase_seed:,
      )
    end

    def morphology(family, designation, ellipticity: 0, bulge_share: 0, arm_count: 0, winding: 0,
      arm_fraction: 0, bar_length: 0, clump_count: 0, clump_spread: 0, phase_seed: 0)
      {
        "family" => family,
        "designation" => designation,
        "knobs" => [
          ellipticity,
          bulge_share,
          arm_count,
          winding,
          arm_fraction,
          bar_length,
          clump_count,
          clump_spread,
          phase_seed,
        ],
      }
    end

    def scaled(value)
      (value * 1000).round
    end

    def fallback
      morphology(SPIRAL, "Sb", bulge_share: DEFAULT_KNOBS[1], arm_count: DEFAULT_KNOBS[2],
        winding: DEFAULT_KNOBS[3], arm_fraction: DEFAULT_KNOBS[4])
    end
  end
end
