# frozen_string_literal: true

require "fileutils"
require "securerandom"

module RubyLens
  # Owner-only atomic replacement shared by every writer: outputs are staged in
  # a 0600 temporary alongside the target and renamed into place, so a partial
  # write never becomes visible and permissions never loosen mid-write.
  module AtomicOutput
    module_function

    def replace(output)
      output = File.expand_path(output)
      FileUtils.mkdir_p(File.dirname(output), mode: 0o700)
      temporary = File.join(File.dirname(output), ".#{File.basename(output)}.#{SecureRandom.hex(6)}.tmp")
      File.open(temporary, File::WRONLY | File::CREAT | File::EXCL, 0o600).close
      yield temporary
      File.chmod(0o600, temporary)
      File.rename(temporary, output)
      File.chmod(0o600, output)
      output
    ensure
      FileUtils.rm_f(temporary) if temporary && File.exist?(temporary)
    end
  end
end
