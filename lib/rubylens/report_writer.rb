# frozen_string_literal: true

require "base64"
require "fileutils"
require "json"
require "securerandom"

module RubyLens
  class ReportWriter
    MODEL_PLACEHOLDER = "{{MODEL_BASE64}}"

    def initialize(asset_assembler: ReportAssetAssembler.new)
      @asset_assembler = asset_assembler
    end

    def write(model, output:)
      output = File.expand_path(output)
      directory = File.dirname(output)
      FileUtils.mkdir_p(directory, mode: 0o700)
      protect_default_directory(directory)
      template = @asset_assembler.assemble
      raise Error, "report template has no model placeholder" unless template.include?(MODEL_PLACEHOLDER)

      payload = Base64.strict_encode64(JSON.generate(model))
      html = template.sub(MODEL_PLACEHOLDER, payload)
      atomic_write(output, html)
      output
    end

    def rubylens_report?(path)
      File.file?(path) && File.open(path, "rb") { |file| file.read(2048).include?('<meta name="generator" content="RubyLens">') }
    rescue Errno::ENOENT, Errno::EACCES
      false
    end

    private

    def protect_default_directory(directory)
      return unless File.basename(directory) == ".rubylens"

      ignore = File.join(directory, ".gitignore")
      atomic_write(ignore, "*\n") unless File.exist?(ignore)
    end

    def atomic_write(path, contents)
      temporary = File.join(File.dirname(path), ".#{File.basename(path)}.#{SecureRandom.hex(6)}.tmp")
      File.open(temporary, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |file| file.write(contents) }
      File.chmod(0o600, temporary)
      File.rename(temporary, path)
      File.chmod(0o600, path)
    ensure
      FileUtils.rm_f(temporary) if temporary && File.exist?(temporary)
    end
  end
end
