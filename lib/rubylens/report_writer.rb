# frozen_string_literal: true

require "base64"
require "fileutils"
require "json"
require_relative "artifact_marker"
require_relative "atomic_output"
require_relative "report_asset_assembler"

module RubyLens
  class ReportWriter
    MODEL_PLACEHOLDER = "{{MODEL_BASE64}}"
    MARKER = '<meta name="generator" content="RubyLens">'

    def initialize(asset_assembler: ReportAssetAssembler.new)
      @asset_assembler = asset_assembler
    end

    def write(model, output:)
      output = File.expand_path(output)
      directory = File.dirname(output)
      FileUtils.mkdir_p(directory, mode: 0o700)
      protect_default_directory(directory)
      template = @asset_assembler.assemble
      unless template.scan(MODEL_PLACEHOLDER).length == 1
        raise Error, "report template must contain exactly one #{MODEL_PLACEHOLDER} placeholder"
      end

      payload = Base64.strict_encode64(JSON.generate(model))
      html = template.sub(MODEL_PLACEHOLDER, payload)
      AtomicOutput.replace(output) { |temporary| File.binwrite(temporary, html) }
    end

    private

    def protect_default_directory(directory)
      return unless File.basename(directory) == ".rubylens"

      ignore = File.join(directory, ".gitignore")
      AtomicOutput.replace(ignore) { |temporary| File.binwrite(temporary, "*\n") } unless File.exist?(ignore)
    end
  end
end
