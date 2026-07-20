# frozen_string_literal: true

require_relative "art_model_builder"
require_relative "errors"

module RubyLens
  class ShowcaseModel
    SIGNAL_FIELDS = ArtModelBuilder::SIGNAL_FIELDS
    TOTAL_FIELDS = %w[namespaces packages dependencyStars].freeze
    CATEGORY_FIELDS = %w[core tests].freeze
    ANNOTATION_LIMIT = 200
    ANNOTATION_CATEGORIES = %w[core dependencies tests].freeze
    OMITTED_ANNOTATION_NAMES = %w[BasicObject Kernel Object].freeze
    RUBY_NAME_PATTERN = /\A\p{Lu}[\p{L}\p{N}_]*(?:::\p{Lu}[\p{L}\p{N}_]*)*\z/
    MAX_ANNOTATION_NAME_LENGTH = 160
    RSPEC_PROXY_PREFIX = "RSpec example group #"
    FALLBACK_MORPHOLOGY_ROW = [MorphologyClassifier::SPIRAL, *MorphologyClassifier::DEFAULT_KNOBS].freeze

    def initialize(model, details: false)
      @model = model
      @details = details == true
    end

    def call
      packages = @model.fetch("packages")
      package_morphologies = @model.fetch("packageMorphologies")
      raise Error, "package morphology rows must align with packages" unless package_morphologies.length == packages.length

      showcase = {
        "schema" => "rubylens.showcase.v5",
        "projectName" => @model.fetch("projectName"),
        "details" => @details,
        "domains" => project_hash(@model.fetch("domains"), SIGNAL_FIELDS),
        "morphology" => morphology_row,
        "namespaces" => @model.fetch("namespaces").map { |row| numeric_row(row, 14) },
        "packages" => packages.map { |row| numeric_row(row, 9) },
        "packageMorphologies" => package_morphologies.map { |row| numeric_row(row, 10) },
        "dependencySystems" => @model.fetch("dependencySystems", []).map { |row| numeric_row(row, 2) },
        "dependencyStars" => @model.fetch("dependencyStars").map { |row| numeric_row(row, 8) },
      }
      return showcase unless @details

      showcase.merge(
        "totals" => project_hash(@model.fetch("totals"), TOTAL_FIELDS),
        "categoryStats" => CATEGORY_FIELDS.to_h do |category|
          [category, numeric_row(@model.fetch("categoryStats").fetch(category), 4)]
        end,
        "pinnedNamespaceAnchors" => pinned_namespace_anchors,
        "annotations" => annotation_projection,
      )
    end

    private

    def morphology_row
      morphology = @model["morphology"]
      return FALLBACK_MORPHOLOGY_ROW.dup unless morphology.is_a?(Array)

      numeric_row(morphology, 10)
    rescue Error
      FALLBACK_MORPHOLOGY_ROW.dup
    end

    def project_hash(source, fields)
      fields.to_h { |field| [field, Integer(source.fetch(field))] }
    end

    def numeric_row(row, length)
      raise Error, "showcase model row has an unexpected shape" unless row.length >= length

      row.first(length).map { |value| Integer(value) }
    rescue ArgumentError, TypeError
      raise Error, "showcase model rows must contain only numbers"
    end

    def annotation_projection
      buckets = {
        "core" => namespace_annotations(test: false),
        "tests" => namespace_annotations(test: true),
        "dependencies" => dependency_annotations,
      }
      annotations = []
      offsets = Hash.new(0)
      while annotations.length < ANNOTATION_LIMIT
        added = false
        ANNOTATION_CATEGORIES.each do |category|
          candidate = buckets.fetch(category)[offsets[category]]
          next unless candidate

          offsets[category] += 1
          annotations << candidate
          added = true
          break if annotations.length == ANNOTATION_LIMIT
        end
        break unless added
      end
      annotations
    end

    def pinned_namespace_anchors
      names = @model.fetch("namespaceNames")
      names.each_index.select do |index|
        OMITTED_ANNOTATION_NAMES.include?(names.fetch(index))
      end
    end

    def namespace_annotations(test:)
      names = @model.fetch("namespaceNames")
      rows = @model.fetch("namespaces")
      names.each_with_index.filter_map do |name, index|
        row = rows.fetch(index)
        next unless (row.fetch(2) == 1) == test
        next if OMITTED_ANNOTATION_NAMES.include?(name)
        next unless safe_ruby_name?(name)

        [row.slice(3, 6).sum, {
          "category" => test ? "tests" : "core",
          "name" => name,
          "kind" => row.fetch(1) == 0 ? "Class" : "Module",
          "anchor" => index,
        }]
      end.sort_by { |rank, candidate| [-rank, candidate.fetch("name"), candidate.fetch("anchor")] }
        .map(&:last)
    end

    def dependency_annotations
      names = @model.fetch("packageNames")
      rows = @model.fetch("packages")
      names.each_with_index.filter_map do |name, index|
        next unless safe_dependency_name?(name)

        [rows.fetch(index).fetch(3), {
          "category" => "dependencies",
          "name" => name,
          "kind" => "Dependency gem",
          "anchor" => index,
        }]
      end.sort_by { |rank, candidate| [-rank, candidate.fetch("name"), candidate.fetch("anchor")] }
        .map(&:last)
    end

    def safe_ruby_name?(name)
      name.is_a?(String) &&
        name.length <= MAX_ANNOTATION_NAME_LENGTH &&
        !name.start_with?(RSPEC_PROXY_PREFIX) &&
        RUBY_NAME_PATTERN.match?(name)
    end

    def safe_dependency_name?(name)
      name.is_a?(String) &&
        name.length <= MAX_ANNOTATION_NAME_LENGTH &&
        DependencyWarning::NAME_PATTERN.match?(name)
    end
  end
end
