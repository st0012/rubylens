# frozen_string_literal: true

require "json"
require_relative "artifact_marker"
require_relative "collection_writer"
require_relative "default_output"
require_relative "generator"

module RubyLens
  CollectionProjectResult = Data.define(:name, :counts, :warnings) do
    def to_payload
      { name: name, counts: counts, warnings: warnings }
    end
  end

  CollectionResult = Data.define(:output_path, :projects) do
    def to_payload
      { output: output_path, projects: projects.map(&:to_payload) }
    end
  end

  class CollectionGenerator
    DEFAULT_COLLECTION_NAME = "rubylens-collection.html"

    def initialize(paths:, output: nil, lockfile: nil)
      @paths = Array(paths).dup
      @output = output
      @lockfile = lockfile
    end

    def call
      raise Error, "collection requires at least two targets" if @paths.length < 2

      roots = @paths.map { |path| File.realpath(path) }
      raise Error, "collection targets must be distinct" unless roots.uniq.length == roots.length

      output = @output || DefaultOutput.resolve(
        root: roots.first,
        name: DEFAULT_COLLECTION_NAME,
        description: "collection",
      ) do |existing|
        ArtifactMarker.present?(existing, CollectionWriter::MARKER)
      end
      galaxy_payloads = []
      project_results = roots.map do |root|
        model, warnings = GenerationPipeline.new(root:, lockfile: @lockfile).call
        galaxy_payloads << JSON.generate(model)
        CollectionProjectResult.new(
          name: model.fetch("projectName"),
          counts: model.fetch("totals").freeze,
          warnings: warnings,
        )
      end
      output_path = CollectionWriter.new.write(galaxy_payloads.freeze, output: output)

      CollectionResult.new(output_path:, projects: project_results.freeze)
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
