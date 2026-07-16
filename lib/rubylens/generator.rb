# frozen_string_literal: true

module RubyLens
  Result = Data.define(:output_path, :counts, :warnings)

  class GenerationPipeline
    def initialize(manifest_builder: Index::Manifest, adapter: Index::RubydexAdapter.new, model_builder: ArtModelBuilder.new)
      @manifest_builder = manifest_builder
      @adapter = adapter
      @model_builder = model_builder
    end

    def call(root:, lockfile: nil)
      manifest = @manifest_builder.build(root: root, lockfile: lockfile)
      snapshot = @adapter.index(manifest)
      model = @model_builder.build(snapshot)
      warning_counts = snapshot.fetch("warning_counts")
      warnings = manifest.warnings.dup
      warnings << "Rubydex reported #{warning_counts.fetch("index")} indexing error(s)." if warning_counts.fetch("index").positive?
      warnings << "Rubydex reported #{warning_counts.fetch("integrity")} integrity issue(s)." if warning_counts.fetch("integrity").positive?
      [model, warnings.freeze]
    end
  end

  class Generator
    DEFAULT_REPORT_NAME = "rubylens-report.html"

    def initialize(
      manifest_builder: Index::Manifest,
      adapter: Index::RubydexAdapter.new,
      model_builder: ArtModelBuilder.new,
      report_writer: ReportWriter.new,
      pipeline: nil
    )
      @pipeline = pipeline || GenerationPipeline.new(manifest_builder:, adapter:, model_builder:)
      @report_writer = report_writer
    end

    def call(path: Dir.pwd, output: nil, lockfile: nil)
      root = File.realpath(path)
      if output.nil?
        output = File.join(root, DEFAULT_REPORT_NAME)
        if File.exist?(output) && !@report_writer.rubylens_report?(output)
          raise Error, "default report path already exists and is not a RubyLens report"
        end
        GitRepository.new(root).exclude_local(output)
      end
      model, warnings = @pipeline.call(root:, lockfile:)
      output_path = @report_writer.write(model, output: output)

      RubyLens::Result.new(output_path: output_path, counts: model.fetch("totals").freeze, warnings:)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
