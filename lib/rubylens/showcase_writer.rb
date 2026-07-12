# frozen_string_literal: true

require_relative "report_writer"

module RubyLens
  class ShowcaseWriter < ReportWriter
    MARKER = '<meta name="rubylens-artifact" content="showcase">'
    SHELL_PATH = File.expand_path("../../assets/shells/showcase.html", __dir__)
    STYLESHEET_PATH = File.expand_path("../../assets/styles/showcase.css", __dir__)
    RUNTIME_PATH = File.expand_path("../../assets/runtime/report.js", __dir__)

    def initialize(template_path: nil, asset_assembler: nil)
      asset_assembler ||= ReportAssetAssembler.new(
        shell_path: SHELL_PATH,
        stylesheet_path: STYLESHEET_PATH,
        runtime_path: RUNTIME_PATH,
      ) unless template_path
      super(template_path:, asset_assembler:)
    end

    def rubylens_showcase?(path)
      File.file?(path) && File.open(path, "rb") { |file| file.read(2048).include?(MARKER) }
    rescue Errno::ENOENT, Errno::EACCES
      false
    end
  end
end
