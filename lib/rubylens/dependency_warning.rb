# frozen_string_literal: true

module RubyLens
  module DependencyWarning
    REASONS = {
      checkout_unavailable: "Bundler checkout is unavailable",
      local_only_required: "Bundler source is not available for local-only indexing",
      specification_unavailable: "Locked gemspec is unavailable in the Bundler checkout",
      specification_unreadable: "Locked gemspec could not be loaded from the Bundler checkout",
      unsafe_specification_root: "Locked gemspec resolves outside the Bundler checkout",
      no_indexable_files: "Locked require paths contain no indexable Ruby files",
    }.freeze
    ALLOWED_REASONS = REASONS.values.freeze
    NAME_PATTERN = /\A[A-Za-z0-9][A-Za-z0-9_.-]*\z/
  end
end
