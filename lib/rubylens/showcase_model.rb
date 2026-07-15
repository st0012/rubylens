# frozen_string_literal: true

require_relative "art_model_builder"
require_relative "errors"

module RubyLens
  class ShowcaseModel
    SIGNAL_FIELDS = ArtModelBuilder::SIGNAL_FIELDS
    TOTAL_FIELDS = %w[namespaces packages dependencyStars renderedDependencyStars].freeze
    CATEGORY_FIELDS = %w[core tests].freeze
    ANNOTATION_LIMIT = 200
    ANNOTATION_CATEGORIES = %w[core dependencies tests].freeze
    OMITTED_ANNOTATION_NAMES = %w[BasicObject Kernel Object].freeze
    RUBY_NAME_PATTERN = /\A\p{Lu}[\p{L}\p{N}_]*(?:::\p{Lu}[\p{L}\p{N}_]*)*\z/
    MAX_ANNOTATION_NAME_LENGTH = 160
    RSPEC_PROXY_PREFIX = "RSpec example group #"

    def call(model, details: false)
      details = details == true
      showcase = {
        "schema" => "rubylens.showcase.v3",
        "projectName" => model.fetch("projectName"),
        "details" => details,
        "domains" => project_hash(model.fetch("domains"), SIGNAL_FIELDS),
        "morphology" => morphology_row(model),
        "namespaces" => model.fetch("namespaces").map { |row| numeric_row(row, 15) },
        "packages" => model.fetch("packages").map { |row| numeric_row(row, 9) },
        "dependencySystems" => model.fetch("dependencySystems", []).map { |row| numeric_row(row, 2) },
        "dependencyStars" => model.fetch("dependencyStars").map { |row| numeric_row(row, 8) },
      }
      return showcase unless details

      showcase.merge(
        "totals" => project_hash(model.fetch("totals"), TOTAL_FIELDS),
        "categoryStats" => CATEGORY_FIELDS.to_h do |category|
          [category, numeric_row(model.fetch("categoryStats").fetch(category), 4)]
        end,
        "pinnedNamespaceAnchors" => pinned_namespace_anchors(model),
        "annotations" => annotation_projection(model),
      )
    end

    private

    def morphology_row(model)
      morphology = model.fetch("morphology")
      numeric_row([morphology.fetch("family"), *morphology.fetch("knobs")], 10)
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

    def annotation_projection(model)
      buckets = {
        "core" => namespace_annotations(model, test: false),
        "tests" => namespace_annotations(model, test: true),
        "dependencies" => dependency_annotations(model),
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

    def pinned_namespace_anchors(model)
      names = model.fetch("namespaceNames")
      names.each_index.select do |index|
        OMITTED_ANNOTATION_NAMES.include?(names.fetch(index))
      end
    end

    def namespace_annotations(model, test:)
      names = model.fetch("namespaceNames")
      rows = model.fetch("namespaces")
      names.each_with_index.filter_map do |name, index|
        row = rows.fetch(index)
        next unless (row.fetch(3) == 1) == test
        next if OMITTED_ANNOTATION_NAMES.include?(name)
        next unless safe_ruby_name?(name)

        [row.slice(4, 6).sum, {
          "category" => test ? "tests" : "core",
          "name" => name,
          "kind" => row.fetch(2) == 0 ? "Class" : "Module",
          "anchor" => index,
        }]
      end.sort_by { |rank, candidate| [-rank, candidate.fetch("name"), candidate.fetch("anchor")] }
        .map(&:last)
    end

    def dependency_annotations(model)
      names = model.fetch("packageNames")
      rows = model.fetch("packages")
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
