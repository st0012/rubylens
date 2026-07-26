# frozen_string_literal: true

require "base64"
require_relative "atomic_output"
require_relative "errors"
require_relative "report_asset_assembler"
require_relative "report_writer"

module RubyLens
  class CollectionWriter
    MARKER = '<meta name="rubylens-artifact" content="collection">'

    def initialize(report_asset_assembler: ReportAssetAssembler.new)
      @report_asset_assembler = report_asset_assembler
    end

    def write(galaxy_payloads, output:)
      raise Error, "collection requires at least two galaxy payloads" if galaxy_payloads.length < 2

      report_template = @report_asset_assembler.assemble
      unless report_template.scan(ReportWriter::MODEL_PLACEHOLDER).length == 1
        raise Error, "report template must contain exactly one #{ReportWriter::MODEL_PLACEHOLDER} placeholder"
      end

      payload = "{\"schema\":\"rubylens.collection.v2\",\"galaxies\":[#{galaxy_payloads.join(",")}]}"
      html = report_template
        .sub(ReportWriter::MODEL_PLACEHOLDER, Base64.strict_encode64(payload))
        .sub(
          '<meta name="generator" content="RubyLens">',
          "<meta name=\"generator\" content=\"RubyLens\">\n  #{MARKER}",
        )
      AtomicOutput.replace(output) { |temporary| File.binwrite(temporary, html) }
    end
  end
end
