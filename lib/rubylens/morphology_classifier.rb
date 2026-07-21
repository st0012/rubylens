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
    LARGE_PACKAGE_ENRICHMENT_THRESHOLD = 10_000
    LARGE_PACKAGE_ENRICHMENT_FAMILIES = [SPIRAL, BARRED_SPIRAL].freeze
    UINT32_MASK = 0xffff_ffff
    UINT32_RANGE = 0x1_0000_0000

    DEFAULT_KNOBS = [0, 240, 3, 105, 380, 0, 0, 0, 0].freeze

    def initialize(snapshot = nil, package: nil, phase_seed: nil)
      raise ArgumentError, "provide a snapshot or package, not both" if snapshot && package

      @snapshot = snapshot
      @package = package
      @phase_seed = phase_seed
    end

    def call
      fallback_phase_seed = package_classification? && valid_phase_seed?(@phase_seed) ? @phase_seed : 0
      inputs = package_classification? ? package_classification_inputs : project_classification_inputs
      return fallback(phase_seed: fallback_phase_seed) unless inputs

      classified = classify(**inputs)
      return classified unless package_classification?

      enrich_large_smooth_package(classified, size: inputs.fetch(:size), phase_seed: inputs.fetch(:phase_seed))
    rescue KeyError, TypeError, ArgumentError
      fallback(phase_seed: fallback_phase_seed)
    end

    private

    def package_classification?
      !@package.nil?
    end

    def project_classification_inputs
      return unless @snapshot.is_a?(Hash)

      rows = @snapshot.fetch("namespaces")
      names = @snapshot.fetch("namespace_names")
      packages = @snapshot.fetch("packages")
      project_name = @snapshot.fetch("project_name")
      return unless rows.is_a?(Array) && names.is_a?(Array) && rows.length == names.length
      return unless packages.is_a?(Array) && project_name.is_a?(String)
      return if rows.empty?
      return unless rows.each_with_index.all? { |row, index| valid_namespace?(row, names[index]) }

      core_indexes = rows.each_index.reject { |index| rows[index][1] == 1 }
      core_count = core_indexes.length
      test_count = rows.length - core_count
      module_count = core_indexes.count { |index| rows[index][0] == 1 }
      dependency_count = packages.sum { |package| dependency_declaration_count(package) }

      module_fraction = ratio(module_count, core_count)
      test_share = ratio(test_count, rows.length)
      dependency_share = ratio(dependency_count, dependency_count + core_count)
      {
        size: rows.length,
        module_fraction:,
        structure: structure(test_share, module_fraction, dependency_share),
        concentration: root_concentration(names, core_indexes, core_count),
        irregularity: (module_fraction + test_share) / 2,
        phase_seed: Digest::SHA256.digest(project_name).unpack1("N"),
      }
    end

    def package_classification_inputs
      return unless @package.is_a?(Hash) && valid_phase_seed?(@phase_seed)

      declarations = @package.fetch("declarations")
      counts = @package.fetch("ruby_counts")
      return unless declarations.is_a?(Array)
      return unless counts.is_a?(Array) && counts.length == 4

      size = declarations.length
      return unless counts.all? { |count| count.is_a?(Integer) && count >= 0 }
      return if counts.sum.zero?

      class_count, module_count, method_count, constant_count = counts
      construct_count = class_count + module_count + method_count + constant_count
      type_count = class_count + module_count
      module_fraction = ratio(module_count, type_count)
      module_structure_signal = (module_count + 0.5) / (type_count + 1.0)
      non_method_share = ratio(class_count + module_count + constant_count, construct_count)
      constant_share = ratio(constant_count, construct_count)
      smoothed_total = construct_count + 2.0
      concentration = counts.sum { |count| ((count + 0.5) / smoothed_total)**2 }

      {
        size:,
        module_fraction:,
        structure: structure(non_method_share, module_structure_signal, constant_share),
        concentration:,
        irregularity: (module_structure_signal + non_method_share) / 2,
        phase_seed: @phase_seed,
      }
    end

    def valid_namespace?(row, name)
      row.is_a?(Array) && row.length >= 2 &&
        [0, 1].include?(row[0]) && [0, 1, 2].include?(row[1]) &&
        name.is_a?(String) && !name.empty?
    end

    def dependency_declaration_count(package)
      raise TypeError unless package.is_a?(Hash)

      declarations = package.fetch("declarations")
      raise TypeError unless declarations.is_a?(Array)

      declarations.length
    end

    def ratio(numerator, denominator)
      denominator.zero? ? 0.0 : numerator.fdiv(denominator)
    end

    def structure(primary_share, module_fraction, tertiary_share)
      [[0.45 * primary_share + 0.30 * module_fraction + 0.25 * tertiary_share, 0.0].max, 1.0].min
    end

    def valid_phase_seed?(value)
      value.is_a?(Integer) && value.between?(0, 0xffff_ffff)
    end

    def root_concentration(names, core_indexes, core_count)
      return 0.0 if core_count.zero?

      counts = core_indexes.map { |index| names[index].split("::", 2).first }.tally
      counts.sum { |_root, count| ratio(count, core_count)**2 }
    end

    def classify(size:, module_fraction:, structure:, concentration:, irregularity:, phase_seed:)
      if size < IRREGULAR_SIZE_LIMIT
        return morphology(
          IRREGULAR,
          "Irr",
          clump_count: 2 + [[(size - 1) / 7, 0].max, 3].min,
          clump_spread: scaled(0.50 + 0.30 * irregularity),
          phase_seed:,
        )
      end

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

      family = concentration >= BAR_CONCENTRATION ? BARRED_SPIRAL : SPIRAL
      stage = [[((structure - LENTICULAR_MAX) / SPIRAL_STAGE_WIDTH).floor, 0].max, 2].min
      progress = [[(structure - LENTICULAR_MAX) / SPIRAL_KNOB_RANGE, 0.0].max, 1.0].min

      spiral_morphology(family:, stage:, progress:, phase_seed:)
    end

    def enrich_large_smooth_package(classified, size:, phase_seed:)
      return classified if size < LARGE_PACKAGE_ENRICHMENT_THRESHOLD
      return classified unless [ELLIPTICAL, LENTICULAR].include?(classified.fetch("family"))

      family_count = LARGE_PACKAGE_ENRICHMENT_FAMILIES.length
      family = LARGE_PACKAGE_ENRICHMENT_FAMILIES.fetch(phase_seed % family_count)
      progress = seeded_unit(phase_seed / family_count, 91)
      stage = [(progress * 3).floor, 2].min

      spiral_morphology(
        family:,
        stage:,
        progress:,
        phase_seed:,
        bar_length: 0.45 + 0.15 * progress,
      )
    end

    def spiral_morphology(family:, stage:, progress:, phase_seed:, bar_length: nil)
      designation = family == BARRED_SPIRAL ? "SB#{%w[a b c][stage]}" : "S#{%w[a b c][stage]}"
      arm_limit = family == BARRED_SPIRAL ? 2 : 4
      morphology(
        family,
        designation,
        bulge_share: scaled(0.36 - 0.22 * progress),
        arm_count: 2 + (progress * arm_limit).round,
        winding: scaled(0.18 - 0.115 * progress),
        arm_fraction: scaled(0.45 + 0.11 * progress),
        bar_length: family == BARRED_SPIRAL ? scaled(bar_length || (0.50 - 0.22 * progress)) : 0,
        phase_seed:,
      )
    end

    def seeded_unit(seed, channel)
      value = (seed ^ (channel * 0x9e37_79b9)) & UINT32_MASK
      value = ((value ^ (value >> 16)) * 0x21f0_aaad) & UINT32_MASK
      value = ((value ^ (value >> 15)) * 0x735a_2d97) & UINT32_MASK
      value = (value ^ (value >> 15)) & UINT32_MASK
      value.fdiv(UINT32_RANGE)
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

    def fallback(phase_seed: 0)
      morphology(SPIRAL, "Sb", bulge_share: DEFAULT_KNOBS[1], arm_count: DEFAULT_KNOBS[2],
        winding: DEFAULT_KNOBS[3], arm_fraction: DEFAULT_KNOBS[4], phase_seed:)
    end
  end
end
