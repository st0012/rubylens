# frozen_string_literal: true

require_relative "artifact_marker"
require_relative "default_output"
require_relative "generator"
require_relative "showcase_model"
require_relative "showcase_writer"

module RubyLens
  class ShowcaseGenerator
    DEFAULT_SHOWCASE_NAME = "rubylens-showcase.html"

    def initialize(path: Dir.pwd, output: nil, lockfile: nil, details: false)
      @path = path
      @output = output
      @lockfile = lockfile
      @details = details
    end

    def call
      root = File.realpath(@path)
      output = @output || DefaultOutput.resolve(root: root, name: DEFAULT_SHOWCASE_NAME, description: "showcase") do |existing|
        ArtifactMarker.present?(existing, ShowcaseWriter::MARKER)
      end
      model, warnings = GenerationPipeline.new(root:, lockfile: @lockfile).call
      output_path = ShowcaseWriter.new.write(ShowcaseModel.new(model, details: @details).call, output: output)

      Result.new(output_path:, counts: model.fetch("totals").freeze, warnings:)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
