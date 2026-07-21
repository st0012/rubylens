# frozen_string_literal: true

require_relative "report_writer"

module RubyLens
  class ShowcaseWriter < ReportWriter
    MARKER = '<meta name="rubylens-artifact" content="showcase">'
    SHELL_PATH = File.expand_path("../../assets/shells/showcase.html", __dir__)
    STYLESHEET_PATH = File.expand_path("../../assets/styles/showcase.css", __dir__)
    RUNTIME_PATH = File.expand_path("../../assets/runtime/report.js", __dir__)

    def initialize
      super(asset_assembler: ReportAssetAssembler.new(
        shell_path: SHELL_PATH,
        stylesheet_path: STYLESHEET_PATH,
        runtime_path: RUNTIME_PATH,
      ))
    end
  end
end
