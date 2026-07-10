module Demo
  module Trackable
  end

  module Auditable
  end

  class Base
  end

  class Order < Base
    include Trackable
    prepend Auditable
    extend Trackable

    TOTAL = 1

    def total
      Helper.calculate(TOTAL)
    end
  end

  module Helper
    def self.calculate(value)
      value
    end
  end
end
