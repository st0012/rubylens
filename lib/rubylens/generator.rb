# frozen_string_literal: true

require_relative "artifact_marker"
require_relative "default_output"
require_relative "explorer_artifact"

module RubyLens
  Result = Data.define(:output_path, :counts, :warnings) do
    def to_payload = { output: output_path, counts: counts, warnings: warnings }
  end

  class GenerationPipeline
    def initialize(root:, lockfile: nil)
      @root = root
      @lockfile = lockfile
    end

    def call
      manifest = Index::Manifest.build(root: @root, lockfile: @lockfile)
      snapshot = Index::RubydexAdapter.new(manifest).index
      model = ArtModelBuilder.new.build(snapshot)
      warning_counts = snapshot.fetch("warning_counts")
      warnings = manifest.warnings.dup
      warnings << "Rubydex reported #{warning_counts.fetch("index")} indexing error(s)." if warning_counts.fetch("index").positive?
      warnings << "Rubydex reported #{warning_counts.fetch("integrity")} integrity issue(s)." if warning_counts.fetch("integrity").positive?
      [model, warnings.freeze]
    end
  end

  class Generator
    DEFAULT_REPORT_NAME = "rubylens-report.html"

    def initialize(path: Dir.pwd, output: nil, lockfile: nil, output_format: "html")
      @path = path
      @output = output
      @lockfile = lockfile
      @output_format = output_format.to_s
    end

    def call
      root = File.realpath(@path)
      case @output_format
      when "html"
        output = @output || DefaultOutput.resolve(root: root, name: DEFAULT_REPORT_NAME, description: "report") do |existing|
          ArtifactMarker.present?(existing, ReportWriter::MARKER)
        end
      when "json"
        output = @output || DefaultOutput.resolve(root: root, name: ExplorerArtifact::DEFAULT_NAME, description: "explorer artifact") do |existing|
          ExplorerArtifact.owned?(existing)
        end
      else
        raise Error, "unsupported Explorer output format: #{@output_format}"
      end
      model, warnings = GenerationPipeline.new(root:, lockfile: @lockfile).call
      output_path = if @output_format == "json"
        ExplorerArtifact.new(galaxy: model, warnings: warnings).write(output: output)
      else
        ReportWriter.new.write(model, output: output)
      end

      RubyLens::Result.new(output_path: output_path, counts: model.fetch("totals").freeze, warnings:)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
