# frozen_string_literal: true

require_relative "errors"

module RubyLens
  class ReportAssetAssembler
    STYLES_PLACEHOLDER = "{{REPORT_STYLES}}"
    RUNTIME_PLACEHOLDER = "{{REPORT_RUNTIME}}"

    def initialize(
      shell_path: File.expand_path("../../assets/shells/report.html", __dir__),
      stylesheet_path: File.expand_path("../../assets/styles/report.css", __dir__),
      runtime_path: nil,
      runtime_paths: nil
    )
      @shell_path = shell_path
      @stylesheet_path = stylesheet_path
      @runtime_paths = runtime_paths || if runtime_path
        [runtime_path]
      else
        [
          File.expand_path("../../assets/runtime/point_renderer.js", __dir__),
          File.expand_path("../../assets/runtime/report.js", __dir__),
        ]
      end
    end

    def assemble
      shell = File.read(@shell_path)
      validate_placeholder(shell, STYLES_PLACEHOLDER)
      validate_placeholder(shell, RUNTIME_PLACEHOLDER)

      shell
        .sub(STYLES_PLACEHOLDER, File.read(@stylesheet_path))
        .sub(RUNTIME_PLACEHOLDER, @runtime_paths.map { |path| File.read(path) }.join("\n"))
    end

    private

    def validate_placeholder(shell, placeholder)
      return if shell.scan(placeholder).length == 1

      raise Error, "report shell must contain exactly one #{placeholder} placeholder"
    end
  end
end
