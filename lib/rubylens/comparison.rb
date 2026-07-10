# frozen_string_literal: true

require "fileutils"
require "json"
require "time"

module RubyLens
  class Comparison
    TOTAL_KEYS = %w[documents declarations definitions orphan_definitions constant_references method_references diagnostics].freeze

    def initialize(control_summary:, workspace_summary:, output_path:)
      @control_summary_path = control_summary
      @workspace_summary_path = workspace_summary
      @output_path = output_path
    end

    def run
      control = JSON.parse(File.read(@control_summary_path))
      workspace = JSON.parse(File.read(@workspace_summary_path))
      validate!(control, workspace)
      gem_origin = workspace.dig("origins", "by_kind", "gem") || {}
      comparison = {
        "schema" => "rubylens.comparison.v1",
        "generated_at" => Time.now.utc.iso8601,
        "target" => workspace.fetch("target").slice("name", "git"),
        "control_status" => control.fetch("status"),
        "workspace_status" => workspace.fetch("status"),
        "totals" => TOTAL_KEYS.to_h do |key|
          control_value = control.dig("totals", key)
          workspace_value = workspace.dig("totals", key)
          [key, {
            "control" => control_value,
            "workspace" => workspace_value,
            "delta" => numeric_delta(control_value, workspace_value),
          }]
        end,
        "origin_deltas" => origin_deltas(control, workspace),
        "dependency_proof" => {
          "external_gem_documents_present" => gem_origin.fetch("documents", 0).positive?,
          "external_gem_definitions_present" => gem_origin.fetch("definitions", 0).positive?,
          "external_gem_declarations_present" => gem_origin.fetch("declarations", 0).positive?,
          "representative_declarations" => gem_origin.fetch("representative_declarations", []),
          "exact_gem_origins" => workspace.dig("origins", "by_exact_origin").keys.grep(/\Agem:/),
          "dependency_coverage" => workspace.fetch("dependency_coverage"),
        },
      }
      FileUtils.mkdir_p(File.dirname(@output_path))
      File.write(@output_path, "#{JSON.pretty_generate(comparison)}\n")
      comparison
    end

    private

    def validate!(control, workspace)
      raise ExtractionError, "first summary is not a control run" unless control.dig("target", "mode") == "control"
      raise ExtractionError, "second summary is not a workspace run" unless workspace.dig("target", "mode") == "workspace"
      return if control.dig("target", "git", "head") == workspace.dig("target", "git", "head")

      raise ExtractionError, "control and workspace summaries have different Git HEADs"
    end

    def numeric_delta(control, workspace)
      return nil unless control.is_a?(Numeric) && workspace.is_a?(Numeric)

      workspace - control
    end

    def origin_deltas(control, workspace)
      control_origins = control.dig("origins", "by_kind")
      workspace_origins = workspace.dig("origins", "by_kind")
      (control_origins.keys | workspace_origins.keys).sort.to_h do |kind|
        [kind, %w[documents definitions declarations].to_h do |metric|
          before = control_origins.dig(kind, metric) || 0
          after = workspace_origins.dig(kind, metric) || 0
          [metric, { "control" => before, "workspace" => after, "delta" => after - before }]
        end]
      end
    end
  end
end
