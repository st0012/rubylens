# frozen_string_literal: true

module RubyLens
  Result = Data.define(:output_path, :counts, :warnings)

  class Generator
    def initialize(
      manifest_builder: Index::Manifest,
      adapter: Index::RubydexAdapter.new,
      model_builder: ArtModelBuilder.new,
      report_writer: ReportWriter.new
    )
      @manifest_builder = manifest_builder
      @adapter = adapter
      @model_builder = model_builder
      @report_writer = report_writer
    end

    def call(path: Dir.pwd, output: nil, lockfile: nil)
      root = File.realpath(path)
      output ||= File.join(root, ".rubylens", "report.html")
      manifest = @manifest_builder.build(root: root, lockfile: lockfile)
      snapshot = @adapter.index(manifest)
      model = @model_builder.build(snapshot)
      output_path = @report_writer.write(model, output: output)
      warning_counts = snapshot.fetch("warning_counts")
      warnings = manifest.warnings.dup
      warnings << "Rubydex reported #{warning_counts.fetch("index")} indexing error(s)." if warning_counts.fetch("index").positive?
      warnings << "Rubydex reported #{warning_counts.fetch("integrity")} integrity issue(s)." if warning_counts.fetch("integrity").positive?

      RubyLens::Result.new(output_path: output_path, counts: model.fetch("totals").freeze, warnings: warnings.freeze)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
