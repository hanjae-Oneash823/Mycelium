import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Search } from "lucide-react";

export function InputGroupDemo() {
  return (
    <InputGroup className="w-[340px] h-10 bg-black border border-transparent text-gray-300 rounded-none flex items-center px-2 shadow-md">
      <InputGroupInput
        placeholder="Search..."
        className="bg-transparent text-gray-300 placeholder:text-gray-300 border-none outline outline-transparent focus:ring-0 px-2"
      />
      <InputGroupAddon>
        <Search className="text-gray-300" />
      </InputGroupAddon>
    </InputGroup>
  );
}
