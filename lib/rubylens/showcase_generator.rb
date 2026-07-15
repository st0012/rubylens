# frozen_string_literal: true

require_relative "generator"
require_relative "showcase_model"
require_relative "showcase_writer"

module RubyLens
  class ShowcaseGenerator
    DEFAULT_SHOWCASE_NAME = "rubylens-showcase.html"

    def initialize(
      manifest_builder: Index::Manifest,
      adapter: Index::RubydexAdapter.new(dependency_row_limit: nil),
      model_builder: ArtModelBuilder.new,
      showcase_model: ShowcaseModel.new,
      showcase_writer: ShowcaseWriter.new,
      pipeline: nil
    )
      @pipeline = pipeline || GenerationPipeline.new(manifest_builder:, adapter:, model_builder:)
      @showcase_model = showcase_model
      @showcase_writer = showcase_writer
    end

    def call(path: Dir.pwd, output: nil, lockfile: nil, details: false)
      root = File.realpath(path)
      if output.nil?
        output = File.join(root, DEFAULT_SHOWCASE_NAME)
        if File.exist?(output) && !@showcase_writer.rubylens_showcase?(output)
          raise Error, "default showcase path already exists and is not a RubyLens showcase"
        end
        GitRepository.new(root).exclude_local(output, description: "showcase")
      end
      model, warnings = @pipeline.call(root:, lockfile:)
      output_path = @showcase_writer.write(@showcase_model.call(model, details: details), output: output)

      Result.new(output_path:, counts: model.fetch("totals").freeze, warnings:)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
