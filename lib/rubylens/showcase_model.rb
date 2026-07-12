# frozen_string_literal: true

require_relative "art_model_builder"
require_relative "errors"

module RubyLens
  class ShowcaseModel
    SIGNAL_FIELDS = ArtModelBuilder::SIGNAL_FIELDS
    TOTAL_FIELDS = %w[namespaces packages dependencyStars renderedDependencyStars].freeze
    CATEGORY_FIELDS = %w[core tests].freeze

    def call(model)
      return configured_model(model) if model.key?("groups")

      {
        "schema" => "rubylens.showcase.v1",
        "projectName" => model.fetch("projectName"),
        "totals" => project_hash(model.fetch("totals"), TOTAL_FIELDS),
        "domains" => project_hash(model.fetch("domains"), SIGNAL_FIELDS),
        "categoryStats" => CATEGORY_FIELDS.to_h do |category|
          [category, numeric_row(model.fetch("categoryStats").fetch(category), 4)]
        end,
        "namespaces" => model.fetch("namespaces").map { |row| numeric_row(row, 15) },
        "packages" => model.fetch("packages").map { |row| numeric_row(row, 8) },
        "dependencyStars" => model.fetch("dependencyStars").map { |row| numeric_row(row, 8) },
      }
    end

    private

    def configured_model(model)
      {
        "schema" => "rubylens.showcase.v2",
        "projectName" => model.fetch("projectName"),
        "totals" => project_hash(
          model.fetch("totals"),
          %w[namespaces renderedNamespaces groups packages dependencyStars renderedDependencyStars],
        ),
        "domains" => project_hash(model.fetch("domains"), SIGNAL_FIELDS),
        "categoryStats" => CATEGORY_FIELDS.to_h do |category|
          [category, numeric_row(model.fetch("categoryStats").fetch(category), 4)]
        end,
        "groups" => model.fetch("groups").map { |row| numeric_row(row, 13) },
        "groupRanges" => model.fetch("groupRanges").map { |row| numeric_row(row, 2) },
        "groupLods" => model.fetch("groupLods").map { |row| numeric_row(row, 2) },
        "groupAnchors" => model.fetch("groupAnchors").map { |row| numeric_row(row, 3) },
        "groupRadii" => model.fetch("groupRadii").map { |value| Integer(value) },
        "namespaces" => model.fetch("namespaces").map { |row| numeric_row(row, 15) },
        "packages" => model.fetch("packages").map { |row| numeric_row(row, 8) },
        "dependencyStars" => model.fetch("dependencyStars").map { |row| numeric_row(row, 8) },
      }
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
  end
end
