# frozen_string_literal: true

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
      showcase_writer = ShowcaseWriter.new
      output = @output
      if output.nil?
        output = File.join(root, DEFAULT_SHOWCASE_NAME)
        if File.exist?(output) && !showcase_writer.rubylens_showcase?(output)
          raise Error, "default showcase path already exists and is not a RubyLens showcase"
        end
        GitRepository.new(root).exclude_local(output, description: "showcase")
      end
      model, warnings = GenerationPipeline.new(root:, lockfile: @lockfile).call
      output_path = showcase_writer.write(ShowcaseModel.new(model, details: @details).call, output: output)

      Result.new(output_path:, counts: model.fetch("totals").freeze, warnings:)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
