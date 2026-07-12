# frozen_string_literal: true

require_relative "art_model_builder"
require_relative "errors"

module RubyLens
  class ShowcaseModel
    SIGNAL_FIELDS = ArtModelBuilder::SIGNAL_FIELDS
    TOTAL_FIELDS = %w[namespaces renderedNamespaces regions packages dependencyStars renderedDependencyStars].freeze
    CATEGORY_FIELDS = %w[core tests].freeze

    def call(model)
      unless model["schema"] == "rubylens.art.v9"
        raise Error, "showcase model requires the unified art.v9 contract"
      end

      {
        "schema" => "rubylens.showcase.v3",
        "projectName" => model.fetch("projectName"),
        "totals" => project_hash(model.fetch("totals"), TOTAL_FIELDS),
        "domains" => project_hash(model.fetch("domains"), SIGNAL_FIELDS),
        "categoryStats" => CATEGORY_FIELDS.to_h do |category|
          [category, numeric_row(model.fetch("categoryStats").fetch(category), 4)]
        end,
        "workspaceRadius" => Integer(model.fetch("workspaceRadius")),
        "workspaceDensity" => numeric_row(model.fetch("workspaceDensity"), 6),
        "regions" => model.fetch("regions").map { |row| numeric_row(row, 13) },
        "regionRanges" => model.fetch("regionRanges").map { |row| numeric_row(row, 2) },
        "regionLods" => model.fetch("regionLods").map { |row| numeric_row(row, 2) },
        "regionBounds" => model.fetch("regionBounds").map { |row| numeric_row(row, 4) },
        "regionCentroids" => model.fetch("regionCentroids").map { |row| numeric_row(row, 3) },
        "namespaces" => model.fetch("namespaces").map { |row| numeric_row(row, 16) },
        "packages" => model.fetch("packages").map { |row| numeric_row(row, 8) },
        "dependencyStars" => model.fetch("dependencyStars").map { |row| numeric_row(row, 8) },
      }
    rescue ArgumentError, TypeError
      raise Error, "showcase model rows must contain only numbers"
    end

    private

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
