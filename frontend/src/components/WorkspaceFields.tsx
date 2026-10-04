import { useId } from "react";
import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
} from "react";
import { humanize } from "../utils/format";
import type { AssetCategory } from "../types/api";

export function TextField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} {...props} />
    </div>
  );
}
export function TextAreaField({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} rows={3} {...props} />
    </div>
  );
}
export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}
export function CategoryField({
  name = "category",
  label = "Asset category",
}: {
  name?: string;
  label?: string;
}) {
  return (
    <SelectField
      name={name}
      label={label}
      required
      defaultValue="water_purifier"
    >
      {(
        [
          "water_purifier",
          "air_conditioner",
          "refrigerator",
          "washing_machine",
          "dishwasher",
          "microwave",
          "geyser",
          "fan",
          "electrical",
          "plumbing",
          "carpentry",
          "pest_control",
          "furniture",
          "lift",
          "general",
          "other",
        ] satisfies AssetCategory[]
      ).map((category) => (
        <option key={category} value={category}>
          {humanize(category)}
        </option>
      ))}
    </SelectField>
  );
}
